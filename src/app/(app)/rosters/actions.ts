"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { contactSchema, editContactSchema, groupSchema } from "@/lib/validation";
import { EVERYONE } from "@/lib/groups";
import { parseCsv } from "@/lib/csv";
import { Role } from "@/generated/prisma/client";

const ROSTER_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

// Write a contact's group memberships from selected ids. "Everyone" is virtual and
// never gets a ContactGroup row, so it is filtered out defensively.
async function writeMemberships(contactId: string, groupIds: string[]): Promise<void> {
  const ids = groupIds.filter(Boolean);
  if (ids.length === 0) return;
  const valid = await prisma.group.findMany({
    where: { id: { in: ids }, name: { not: EVERYONE } },
    select: { id: true },
  });
  if (valid.length === 0) return;
  await prisma.contactGroup.createMany({
    data: valid.map((g) => ({ contactId, groupId: g.id })),
    skipDuplicates: true,
  });
}

export async function createContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return parsed.state;

  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.contact.findUnique({ where: { email } });
  if (clash) return { fieldErrors: { email: "A contact with this email already exists." } };

  const contact = await prisma.contact.create({
    data: {
      name: parsed.data.name,
      email,
      instrument: parsed.data.instrument || null,
      grade: parsed.data.grade ?? null,
    },
  });
  await writeMemberships(contact.id, formData.getAll("groupIds").map(String));
  await logAudit({ actorId: actor.id, action: "CONTACT_CREATED", target: email });
  revalidatePath("/rosters");
  return { success: true, message: "Contact added." };
}

export async function editContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const parsed = parseForm(editContactSchema, formData);
  if (!parsed.ok) return parsed.state;

  const target = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } });
  if (!target) return { error: "Contact not found." };

  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.contact.findFirst({ where: { email, NOT: { id: target.id } } });
  if (clash) return { fieldErrors: { email: "A contact with this email already exists." } };

  await prisma.contact.update({
    where: { id: target.id },
    data: {
      name: parsed.data.name,
      email,
      instrument: parsed.data.instrument || null,
      grade: parsed.data.grade ?? null,
    },
  });
  // Replace memberships wholesale to match the submitted selection.
  await prisma.contactGroup.deleteMany({ where: { contactId: target.id } });
  await writeMemberships(target.id, formData.getAll("groupIds").map(String));
  await logAudit({ actorId: actor.id, action: "CONTACT_EDITED", target: email });
  revalidatePath("/rosters");
  return { success: true, message: "Contact updated." };
}

export async function deleteContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const contactId = String(formData.get("contactId") ?? "");
  const target = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!target) return { error: "Contact not found." };

  await prisma.contact.delete({ where: { id: target.id } });
  await logAudit({ actorId: actor.id, action: "CONTACT_DELETED", target: target.email });
  revalidatePath("/rosters");
  return { success: true, message: "Contact deleted." };
}

export async function createGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const parsed = parseForm(groupSchema, formData);
  if (!parsed.ok) return parsed.state;

  const clash = await prisma.group.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (clash) return { fieldErrors: { name: "A group with this name already exists." } };

  await prisma.group.create({ data: { name: parsed.data.name, builtIn: false } });
  await logAudit({ actorId: actor.id, action: "GROUP_CREATED", target: parsed.data.name });
  revalidatePath("/rosters");
  return { success: true, message: "Group created." };
}

export async function deleteGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const groupId = String(formData.get("groupId") ?? "");
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Group not found." };
  if (group.builtIn) return { error: "Built-in groups can't be deleted." };

  await prisma.group.delete({ where: { id: group.id } });
  await logAudit({ actorId: actor.id, action: "GROUP_DELETED", target: group.name });
  revalidatePath("/rosters");
  return { success: true, message: "Group deleted." };
}

// ---------------------------------------------------------------------------
// CSV import — two phase (preview, then commit). Both re-derive from the raw text
// server-side; the client never sends trusted row data.
// ---------------------------------------------------------------------------

export type ImportRowStatus = "new" | "duplicate" | "exists" | "error";

export type ImportPreviewRow = {
  line: number;
  name: string;
  email: string;
  instrument: string;
  group: string;
  status: ImportRowStatus;
  reason?: string;
};

export type ImportPreview = {
  ok: boolean;
  error?: string;
  rows: ImportPreviewRow[];
  counts: { new: number; duplicate: number; exists: number; error: number };
};

export type ImportResult = {
  ok: boolean;
  error?: string;
  imported: number;
  skipped: number;
  errors: number;
};

type Classified = {
  preview: ImportPreviewRow[];
  // Importable rows resolved to concrete data, in source order.
  importable: {
    name: string;
    email: string;
    instrument: string | null;
    grade: number | null;
    groupIds: string[];
  }[];
  globalError?: string;
};

async function classify(csvText: string): Promise<Classified> {
  const { header, rows } = parseCsv(csvText);
  if (header.length === 0) {
    return { preview: [], importable: [], globalError: "The file is empty." };
  }
  const col = {
    name: header.indexOf("name"),
    email: header.indexOf("email"),
    instrument: header.indexOf("instrument"),
    grade: header.indexOf("grade"),
    group: header.indexOf("group"),
  };
  if (col.name === -1 || col.email === -1) {
    return {
      preview: [],
      importable: [],
      globalError: "CSV must have at least Name and Email columns.",
    };
  }

  const groups = await prisma.group.findMany({ select: { id: true, name: true } });
  const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
  const existing = await prisma.contact.findMany({ select: { email: true } });
  const existingEmails = new Set(existing.map((c) => c.email.toLowerCase()));

  const seen = new Set<string>();
  const preview: ImportPreviewRow[] = [];
  const importable: Classified["importable"] = [];

  rows.forEach((cells, idx) => {
    const name = (cells[col.name] ?? "").trim();
    const rawEmail = (cells[col.email] ?? "").trim();
    const email = rawEmail.toLowerCase();
    const instrument = col.instrument >= 0 ? (cells[col.instrument] ?? "").trim() : "";
    const gradeRaw = col.grade >= 0 ? (cells[col.grade] ?? "").trim() : "";
    const group = col.group >= 0 ? (cells[col.group] ?? "").trim() : "";
    const base = { line: idx + 1, name, email: rawEmail, instrument, group };

    const parsed = contactSchema.safeParse({ name, email: rawEmail, instrument, grade: gradeRaw });
    if (!parsed.success) {
      preview.push({ ...base, status: "error", reason: parsed.error.issues[0]?.message ?? "Invalid row." });
      return;
    }

    let groupId: string | null = null;
    if (group) {
      const found = groupByName.get(group.toLowerCase());
      if (!found) {
        preview.push({ ...base, status: "error", reason: `Unknown group "${group}".` });
        return;
      }
      // "Everyone" is virtual — silently ignore it as a target (no membership row).
      if (found.name !== EVERYONE) groupId = found.id;
    }

    if (seen.has(email)) {
      preview.push({ ...base, status: "duplicate", reason: "Repeated email in this file." });
      return;
    }
    seen.add(email);

    if (existingEmails.has(email)) {
      preview.push({ ...base, status: "exists", reason: "Already in the roster." });
      return;
    }

    preview.push({ ...base, status: "new" });
    importable.push({
      name,
      email,
      instrument: instrument || null,
      grade: parsed.data.grade ?? null,
      groupIds: groupId ? [groupId] : [],
    });
  });

  return { preview, importable };
}

export async function previewImportAction(csvText: string): Promise<ImportPreview> {
  await requireRole(...ROSTER_ROLES);
  const { preview, globalError } = await classify(csvText);
  if (globalError) {
    return {
      ok: false,
      error: globalError,
      rows: [],
      counts: { new: 0, duplicate: 0, exists: 0, error: 0 },
    };
  }
  const counts = { new: 0, duplicate: 0, exists: 0, error: 0 };
  for (const r of preview) {
    if (r.status === "new") counts.new++;
    else if (r.status === "duplicate") counts.duplicate++;
    else if (r.status === "exists") counts.exists++;
    else counts.error++;
  }
  return { ok: true, rows: preview, counts };
}

export async function commitImportAction(csvText: string): Promise<ImportResult> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const { preview, importable, globalError } = await classify(csvText);
  if (globalError) {
    return { ok: false, error: globalError, imported: 0, skipped: 0, errors: 0 };
  }

  const errors = preview.filter((r) => r.status === "error").length;
  const skipped = preview.filter((r) => r.status === "duplicate" || r.status === "exists").length;

  await prisma.$transaction(async (tx) => {
    for (const row of importable) {
      const contact = await tx.contact.create({
        data: { name: row.name, email: row.email, instrument: row.instrument, grade: row.grade },
      });
      if (row.groupIds.length > 0) {
        await tx.contactGroup.createMany({
          data: row.groupIds.map((groupId) => ({ contactId: contact.id, groupId })),
          skipDuplicates: true,
        });
      }
    }
  });

  await logAudit({
    actorId: actor.id,
    action: "ROSTER_IMPORTED",
    metadata: { imported: importable.length, skipped, errors },
  });
  revalidatePath("/rosters");
  return { ok: true, imported: importable.length, skipped, errors };
}
