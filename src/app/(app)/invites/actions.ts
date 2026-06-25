"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { randomToken, expiresInDays } from "@/lib/tokens";
import { inviteEmail, sendMail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { inviteSchema } from "@/lib/validation";
import { Role } from "@/generated/prisma/client";

export async function createInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Admins and drum majors may invite; librarians may not.
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const parsed = parseForm(inviteSchema, formData);
  if (!parsed.ok) return parsed.state;

  // Only admins can invite admins.
  if (parsed.data.role === Role.ADMIN && user.role !== Role.ADMIN) {
    return { fieldErrors: { role: "Only admins can invite admins" } };
  }
  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return { fieldErrors: { email: "A user with this email already exists" } };
  }
  const pending = await prisma.invite.findFirst({
    where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pending) return { fieldErrors: { email: "An active invite already exists for this email" } };

  const token = randomToken();
  await prisma.invite.create({
    data: { email, role: parsed.data.role, token, invitedById: user.id, expiresAt: expiresInDays(7) },
  });
  const mail = inviteEmail(user.name, token);
  try {
    await sendMail({ to: email, subject: mail.subject, html: mail.html });
  } catch (err) {
    return { error: `Invite saved, but email failed to send: ${(err as Error).message}` };
  }
  await logAudit({ actorId: user.id, action: "INVITE_SENT", target: email, metadata: { role: parsed.data.role } });
  revalidatePath("/invites");
  return { success: true, message: `Invite sent to ${email}.` };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const id = String(formData.get("inviteId") ?? "");
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (invite && !invite.acceptedAt) {
    await prisma.invite.delete({ where: { id } });
    await logAudit({ actorId: user.id, action: "INVITE_REVOKED", target: invite.email });
  }
  revalidatePath("/invites");
}
