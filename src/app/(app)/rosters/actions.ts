"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { contactSchema, editContactSchema, groupSchema } from "@/lib/validation";
import { EVERYONE } from "@/lib/groups";
import { parseCsv } from "@/lib/csv";
import { parseClassroomPeople } from "@/lib/classroom-roster";
import { getLeadershipEmails } from "@/lib/leadership";
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

// ---------------------------------------------------------------------------
// Google Classroom import — upload a saved "People" page. Two phase like CSV:
// preview classifies every row; commit re-parses the same file and applies.
// ---------------------------------------------------------------------------

export type ClassroomRowStatus =
  | "new"
  | "in-group"
  | "add-to-group"
  | "remove-from-group"
  | "delete"
  | "skipped";

export type ClassroomPreviewRow = {
  name: string;
  email: string;
  status: ClassroomRowStatus;
  reason?: string;
  // Email belongs to a portal user (drum major / admin). Imported like anyone
  // else; shown so it's clear they'll never be emailed twice.
  leader: boolean;
};

export type ClassroomPreview = {
  ok: boolean;
  error?: string;
  groupName: string;
  className: string | null;
  expectedCount: number | null;
  warnings: string[];
  rows: ClassroomPreviewRow[];
  counts: Record<ClassroomRowStatus, number>;
};

export type ClassroomImportResult = {
  ok: boolean;
  error?: string;
  added: number;
  addedToGroup: number;
  removed: number;
  deleted: number;
  skipped: number;
};

const MAX_CLASSROOM_BYTES = 10 * 1024 * 1024;

type ClassroomPlan = {
  groupName: string;
  className: string | null;
  expectedCount: number | null;
  warnings: string[];
  rows: ClassroomPreviewRow[];
  create: { name: string; email: string }[];
  addMembership: string[]; // contact ids
  removeMembership: string[]; // contact ids
  deleteContacts: string[]; // contact ids
};

async function planClassroomImport(
  formData: FormData,
): Promise<{ ok: true; plan: ClassroomPlan } | { ok: false; error: string }> {
  const file = formData.get("file");
  const groupId = String(formData.get("groupId") ?? "");
  const sync = formData.get("syncGroup") === "on";
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the saved .html file first." };
  if (file.size > MAX_CLASSROOM_BYTES) return { ok: false, error: "That file is too large (max 10 MB)." };

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { ok: false, error: "Pick a group." };
  if (group.name === EVERYONE) return { ok: false, error: "“Everyone” is automatic — pick a class group." };

  const roster = parseClassroomPeople(await file.text());

  const [existing, leadershipEmails, members] = await Promise.all([
    prisma.contact.findMany({ select: { id: true, name: true, email: true, groups: { select: { groupId: true } } } }),
    getLeadershipEmails(),
    prisma.contactGroup.findMany({ where: { groupId: group.id }, select: { contactId: true } }),
  ]);
  const byEmail = new Map(existing.map((c) => [c.email.toLowerCase(), c]));
  const leaders = new Set(leadershipEmails);
  const inGroup = new Set(members.map((m) => m.contactId));

  const rows: ClassroomPreviewRow[] = [];
  const create: ClassroomPlan["create"] = [];
  const addMembership: string[] = [];
  const fileEmails = new Set<string>();

  for (const s of roster.students) {
    fileEmails.add(s.email);
    const leader = leaders.has(s.email);
    const found = byEmail.get(s.email);
    if (!found) {
      rows.push({ name: s.name, email: s.email, status: "new", leader });
      create.push({ name: s.name, email: s.email });
    } else if (inGroup.has(found.id)) {
      rows.push({ name: found.name, email: s.email, status: "in-group", leader });
    } else {
      rows.push({ name: found.name, email: s.email, status: "add-to-group", reason: "Already a contact", leader });
      addMembership.push(found.id);
    }
  }
  for (const k of roster.skipped) {
    rows.push({ name: k.name, email: k.email, status: "skipped", reason: k.reason, leader: false });
  }

  const removeMembership: string[] = [];
  const deleteContacts: string[] = [];
  if (sync) {
    for (const c of existing) {
      if (!inGroup.has(c.id) || fileEmails.has(c.email.toLowerCase())) continue;
      const otherGroups = c.groups.filter((g) => g.groupId !== group.id).length;
      if (otherGroups > 0) {
        rows.push({ name: c.name, email: c.email, status: "remove-from-group", reason: "Not in this file; stays in other groups", leader: leaders.has(c.email.toLowerCase()) });
        removeMembership.push(c.id);
      } else {
        rows.push({ name: c.name, email: c.email, status: "delete", reason: "Not in this file and in no other group", leader: leaders.has(c.email.toLowerCase()) });
        deleteContacts.push(c.id);
      }
    }
  }

  return {
    ok: true,
    plan: {
      groupName: group.name,
      className: roster.className,
      expectedCount: roster.expectedCount,
      warnings: roster.warnings,
      rows,
      create,
      addMembership,
      removeMembership,
      deleteContacts,
    },
  };
}

const EMPTY_COUNTS: Record<ClassroomRowStatus, number> = {
  new: 0,
  "in-group": 0,
  "add-to-group": 0,
  "remove-from-group": 0,
  delete: 0,
  skipped: 0,
};

export async function previewClassroomImportAction(formData: FormData): Promise<ClassroomPreview> {
  await requireRole(...ROSTER_ROLES);
  const res = await planClassroomImport(formData);
  if (!res.ok) {
    return { ok: false, error: res.error, groupName: "", className: null, expectedCount: null, warnings: [], rows: [], counts: { ...EMPTY_COUNTS } };
  }
  const counts = { ...EMPTY_COUNTS };
  for (const r of res.plan.rows) counts[r.status]++;
  const { plan } = res;
  return {
    ok: true,
    groupName: plan.groupName,
    className: plan.className,
    expectedCount: plan.expectedCount,
    warnings: plan.warnings,
    rows: plan.rows,
    counts,
  };
}

export async function commitClassroomImportAction(formData: FormData): Promise<ClassroomImportResult> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const res = await planClassroomImport(formData);
  if (!res.ok) return { ok: false, error: res.error, added: 0, addedToGroup: 0, removed: 0, deleted: 0, skipped: 0 };
  const { plan } = res;
  const groupId = String(formData.get("groupId"));

  await prisma.$transaction(async (tx) => {
    for (const c of plan.create) {
      const contact = await tx.contact.create({ data: { name: c.name, email: c.email } });
      await tx.contactGroup.create({ data: { contactId: contact.id, groupId } });
    }
    if (plan.addMembership.length > 0) {
      await tx.contactGroup.createMany({
        data: plan.addMembership.map((contactId) => ({ contactId, groupId })),
        skipDuplicates: true,
      });
    }
    if (plan.removeMembership.length > 0) {
      await tx.contactGroup.deleteMany({ where: { groupId, contactId: { in: plan.removeMembership } } });
    }
    if (plan.deleteContacts.length > 0) {
      await tx.contact.deleteMany({ where: { id: { in: plan.deleteContacts } } });
    }
  });

  const skipped = plan.rows.filter((r) => r.status === "skipped").length;
  await logAudit({
    actorId: actor.id,
    action: "ROSTER_IMPORTED",
    target: plan.groupName,
    metadata: {
      source: "classroom",
      className: plan.className,
      added: plan.create.length,
      addedToGroup: plan.addMembership.length,
      removed: plan.removeMembership.length,
      deleted: plan.deleteContacts.length,
      skipped,
    },
  });
  revalidatePath("/rosters");
  return {
    ok: true,
    added: plan.create.length,
    addedToGroup: plan.addMembership.length,
    removed: plan.removeMembership.length,
    deleted: plan.deleteContacts.length,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Year rollover: wipe the roster (or one group). Announcement history keeps its
// per-recipient EmailDelivery rows (email strings), so nothing sent is lost.
// ---------------------------------------------------------------------------

export async function clearRosterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  if (String(formData.get("confirm") ?? "").trim() !== "CLEAR") {
    return { fieldErrors: { confirm: "Type CLEAR to confirm." } };
  }
  const { count } = await prisma.contact.deleteMany({});
  await logAudit({ actorId: actor.id, action: "ROSTER_CLEARED", metadata: { count } });
  revalidatePath("/rosters");
  return { success: true, message: `Removed ${count} contact${count === 1 ? "" : "s"}.` };
}

export async function clearGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...ROSTER_ROLES);
  const groupId = String(formData.get("groupId") ?? "");
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Group not found." };
  if (group.name === EVERYONE) return { error: "“Everyone” can't be emptied — clear the whole roster instead." };
  const { count } = await prisma.contactGroup.deleteMany({ where: { groupId: group.id } });
  await logAudit({ actorId: actor.id, action: "GROUP_CLEARED", target: group.name, metadata: { count } });
  revalidatePath("/rosters");
  return { success: true, message: `Removed ${count} member${count === 1 ? "" : "s"} from ${group.name}.` };
}
