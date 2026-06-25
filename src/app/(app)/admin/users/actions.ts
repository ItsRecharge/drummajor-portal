"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { startImpersonation } from "@/lib/impersonation";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { adminEditUserSchema, godModeCredsSchema } from "@/lib/validation";
import { Role } from "@/generated/prisma/client";

async function adminCount(): Promise<number> {
  return prisma.user.count({ where: { role: Role.ADMIN } });
}

export async function editUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(Role.ADMIN);
  const parsed = parseForm(adminEditUserSchema, formData);
  if (!parsed.ok) return parsed.state;

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "User not found." };

  // Never allow the last admin to be demoted.
  if (target.role === Role.ADMIN && parsed.data.role !== Role.ADMIN && (await adminCount()) <= 1) {
    return { error: "You can't remove the last admin." };
  }
  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.user.findFirst({ where: { email, NOT: { id: target.id } } });
  if (clash) return { fieldErrors: { email: "Email already in use" } };

  await prisma.user.update({
    where: { id: target.id },
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      // Admin edits are trusted — keep the account verified.
      emailVerified: target.emailVerified ?? new Date(),
    },
  });
  await logAudit({
    actorId: actor.id,
    action: "USER_EDITED",
    target: target.email,
    metadata: { role: parsed.data.role },
  });
  revalidatePath("/admin/users");
  return { success: true, message: "User updated." };
}

export async function godModeCredsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user: actor } = await requireRole(Role.ADMIN);
  const parsed = parseForm(godModeCredsSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!parsed.data.newEmail && !parsed.data.newPassword) {
    return { error: "Provide a new email and/or password." };
  }

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return { error: "User not found." };

  const data: { email?: string; emailVerified?: Date; passwordHash?: string } = {};
  if (parsed.data.newEmail) {
    const email = parsed.data.newEmail.toLowerCase();
    const clash = await prisma.user.findFirst({ where: { email, NOT: { id: target.id } } });
    if (clash) return { fieldErrors: { newEmail: "Email already in use" } };
    data.email = email;
    data.emailVerified = new Date();
  }
  if (parsed.data.newPassword) {
    data.passwordHash = await hashPassword(parsed.data.newPassword);
  }

  await prisma.user.update({ where: { id: target.id }, data });
  await logAudit({
    actorId: actor.id,
    action: "GOD_MODE_CREDENTIAL_EDIT",
    target: target.email,
    metadata: { changedEmail: !!data.email, changedPassword: !!data.passwordHash },
  });
  revalidatePath("/admin/users");
  return { success: true, message: "Credentials updated." };
}

// Hands the top-level admin role to another user and demotes the acting admin.
export async function transferAdminAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(Role.ADMIN);
  const targetId = String(formData.get("userId") ?? "");
  if (targetId === actor.id) return;
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return;

  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { role: Role.ADMIN } }),
    prisma.user.update({ where: { id: actor.id }, data: { role: Role.DRUM_MAJOR } }),
  ]);
  await logAudit({ actorId: actor.id, action: "ADMIN_TRANSFERRED", target: target.email });
  redirect("/dashboard");
}

export async function impersonateAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(Role.ADMIN);
  const targetId = String(formData.get("userId") ?? "");
  if (targetId && targetId !== actor.id) {
    await startImpersonation(actor.id, targetId);
  }
  redirect("/dashboard");
}
