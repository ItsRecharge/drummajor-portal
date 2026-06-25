"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { randomToken, expiresInHours } from "@/lib/tokens";
import { passwordResetEmail, verificationEmail, sendMail } from "@/lib/email";
import { isAllowedEmail } from "@/lib/allowlist";
import { parseForm, type ActionState } from "@/lib/form";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from "@/lib/validation";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return parsed.state;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const ok = user && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !ok) return { error: "Invalid email or password." };
  if (!user.emailVerified) return { error: "Please verify your email before logging in." };

  await createSession(user.id);
  redirect("/dashboard");
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(forgotPasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  // Always report success regardless of whether the account exists (no enumeration).
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (user) {
    const token = randomToken();
    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt: expiresInHours(1) },
    });
    const mail = passwordResetEmail(token);
    try {
      await sendMail({ to: user.email, subject: mail.subject, html: mail.html });
    } catch {
      // Swallow send failures so we don't leak account existence or SMTP state.
    }
  }
  return { success: true, message: "If that account exists, a reset link is on its way." };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const parsed = parseForm(resetPasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  const reset = await prisma.passwordReset.findUnique({ where: { token } });
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
    return { error: "This reset link is invalid or has expired." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Invalidate all existing sessions for this user after a reset.
    prisma.session.deleteMany({ where: { userId: reset.userId } }),
  ]);
  redirect("/login?reset=1");
}

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const parsed = parseForm(acceptInviteSchema, formData);
  if (!parsed.ok) return parsed.state;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    return { error: "This invite is invalid or has expired." };
  }
  // Re-check the allowlist at acceptance (the invited address must still qualify).
  if (!isAllowedEmail(invite.email)) {
    return { error: "This email address is not permitted to register." };
  }
  if (await prisma.user.findUnique({ where: { email: invite.email.toLowerCase() } })) {
    return { error: "An account with this email already exists." };
  }

  const verifyToken = randomToken();
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: invite.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.data.password),
      role: invite.role,
      instrument: parsed.data.instrument || null,
      gradYear: parsed.data.gradYear ?? null,
    },
  });
  await prisma.$transaction([
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    prisma.emailVerification.create({
      data: { userId: user.id, email: user.email, token: verifyToken, expiresAt: expiresInHours(24) },
    }),
  ]);

  const mail = verificationEmail(verifyToken);
  try {
    await sendMail({ to: user.email, subject: mail.subject, html: mail.html });
  } catch {
    // Non-fatal; the user can request a new verification later.
  }
  return {
    success: true,
    message: "Account created. Check your email for a verification link, then sign in.",
  };
}

export async function verifyEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const record = await prisma.emailVerification.findUnique({ where: { token } });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    return { error: "This verification link is invalid or has expired." };
  }
  // Covers both first-time signup (email unchanged) and email-change verification.
  if (!isAllowedEmail(record.email)) {
    return { error: "This email address is not permitted." };
  }
  const clash = await prisma.user.findFirst({
    where: { email: record.email.toLowerCase(), NOT: { id: record.userId } },
  });
  if (clash) return { error: "That email is already in use by another account." };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { email: record.email.toLowerCase(), emailVerified: new Date() },
    }),
    prisma.emailVerification.delete({ where: { id: record.id } }),
  ]);
  redirect("/login?verified=1");
}
