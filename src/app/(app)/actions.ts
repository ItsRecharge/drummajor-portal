"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureAppSettings } from "@/lib/settings";
import { isLeadership } from "@/lib/roles";
import { destroyCurrentSession } from "@/lib/session";
import { stopImpersonation } from "@/lib/impersonation";
import type { ActionState } from "@/lib/form";
import { Role } from "@/generated/prisma/client";

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export async function stopImpersonationAction(): Promise<void> {
  await stopImpersonation();
  redirect("/admin/users");
}

// From the sign-on banner: any leader can pick the drum major who is CC'd on
// conflict emails (admins can also change it under Settings).
export async function assignAbsenceCcAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const id = String(formData.get("absenceCcUserId") ?? "");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
  if (!target || !isLeadership(target.role)) return { error: "Pick a drum major or admin from the portal." };

  const settingsId = await ensureAppSettings();
  await prisma.appSettings.update({ where: { id: settingsId }, data: { absenceCcUserId: target.id } });
  await logAudit({ actorId: actor.id, action: "ATTENDANCE_CC_ASSIGNED", target: target.name });
  revalidatePath("/", "layout");
  return { success: true, message: `${target.name} will be CC'd on conflicts.` };
}
