"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { encryptJson } from "@/lib/crypto";
import { ensureAppSettings, isSetupComplete } from "@/lib/settings";
import { createSession } from "@/lib/session";
import { sendTestEmail, type SmtpConfig } from "@/lib/email";
import { parseForm, type ActionState } from "@/lib/form";
import { orgSchema, firstAdminSchema, smtpSchema } from "@/lib/validation";
import { Role } from "@/generated/prisma/client";

// The wizard is only usable before setup completes. Every action re-checks this
// so it can't be replayed to mutate a live install.
async function assertSetupOpen() {
  if (await isSetupComplete()) redirect("/dashboard");
}

export async function saveOrgAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSetupOpen();
  const parsed = parseForm(orgSchema, formData);
  if (!parsed.ok) return parsed.state;

  const existing = await prisma.organization.findFirst();
  if (existing) {
    await prisma.organization.update({ where: { id: existing.id }, data: parsed.data });
  } else {
    await prisma.organization.create({ data: parsed.data });
  }
  revalidatePath("/setup");
  return { success: true };
}

export async function createFirstAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSetupOpen();
  const parsed = parseForm(firstAdminSchema, formData);
  if (!parsed.ok) return parsed.state;

  if ((await prisma.user.count()) > 0) {
    return { error: "An admin already exists." };
  }
  const existingEmail = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existingEmail) return { fieldErrors: { email: "Email already in use" } };

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.data.password),
      role: Role.ADMIN,
      emailVerified: new Date(),
    },
  });
  revalidatePath("/setup");
  return { success: true };
}

// Sends a test email with the unsaved SMTP config (the wizard "Send test" button).
export async function testSmtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSetupOpen();
  const parsed = parseForm(smtpSchema, formData);
  if (!parsed.ok) return parsed.state;

  const admin = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const to = admin?.email ?? parsed.data.user;
  try {
    await sendTestEmail(parsed.data as SmtpConfig, to);
    return { success: true, message: `Test email sent to ${to}.` };
  } catch (err) {
    return { error: `Could not send: ${(err as Error).message}` };
  }
}

export async function saveSmtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await assertSetupOpen();
  const parsed = parseForm(smtpSchema, formData);
  if (!parsed.ok) return parsed.state;

  const id = await ensureAppSettings();
  await prisma.appSettings.update({
    where: { id },
    data: { smtpConfigEnc: encryptJson(parsed.data) },
  });
  revalidatePath("/setup");
  return { success: true };
}

// Finishes setup. Optionally stores the Drive service-account JSON (folder /
// Shared-Drive strategy is Stage 4); marks setup complete; logs the admin in.
export async function finishSetupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertSetupOpen();

  const file = formData.get("serviceAccount");
  let driveConfigEnc: string | undefined;
  if (file && file instanceof File && file.size > 0) {
    let json: { client_email?: string; private_key?: string };
    try {
      json = JSON.parse(await file.text());
    } catch {
      return { fieldErrors: { serviceAccount: "Not valid JSON" } };
    }
    if (!json.client_email || !json.private_key) {
      return { fieldErrors: { serviceAccount: "Missing client_email / private_key" } };
    }
    driveConfigEnc = encryptJson(json);
  }

  const id = await ensureAppSettings();
  await prisma.appSettings.update({
    where: { id },
    data: { setupComplete: true, ...(driveConfigEnc ? { driveConfigEnc } : {}) },
  });

  const admin = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (admin) await createSession(admin.id);
  redirect("/dashboard");
}
