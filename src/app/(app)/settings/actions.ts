"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getSession, destroyOtherSessions } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { randomToken, expiresInHours } from "@/lib/tokens";
import { verificationEmail, sendMail } from "@/lib/email";
import { parseForm, type ActionState } from "@/lib/form";
import { profileSchema, changePasswordSchema, changeEmailSchema } from "@/lib/validation";

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth();
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.ok) return parsed.state;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      instrument: parsed.data.instrument || null,
      gradYear: parsed.data.gradYear ?? null,
    },
  });
  revalidatePath("/settings");
  return { success: true, message: "Profile updated." };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth();
  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { fieldErrors: { currentPassword: "Current password is incorrect" } };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  // Keep this device signed in; drop the others after a credential change.
  const session = await getSession();
  if (session) await destroyOtherSessions(user.id, session.sessionToken);
  revalidatePath("/settings");
  return { success: true, message: "Password changed. Other devices were signed out." };
}

export async function changeEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth();
  const parsed = parseForm(changeEmailSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { fieldErrors: { password: "Password is incorrect" } };
  }
  const newEmail = parsed.data.newEmail.toLowerCase();
  if (newEmail === user.email) return { fieldErrors: { newEmail: "That's already your email" } };
  if (await prisma.user.findUnique({ where: { email: newEmail } })) {
    return { fieldErrors: { newEmail: "That email is already in use" } };
  }

  // The change only takes effect once the NEW address is verified.
  const token = randomToken();
  await prisma.emailVerification.create({
    data: { userId: user.id, email: newEmail, token, expiresAt: expiresInHours(24) },
  });
  const mail = verificationEmail(token);
  await sendMail({ to: newEmail, subject: mail.subject, html: mail.html });
  return { success: true, message: `Verification sent to ${newEmail}. It takes effect once confirmed.` };
}

export async function logoutOtherDevicesAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAuth();
  const session = await getSession();
  if (!session) return { error: "No active session." };
  const count = await destroyOtherSessions(user.id, session.sessionToken);
  revalidatePath("/settings");
  return { success: true, message: `Signed out ${count} other device(s).` };
}
