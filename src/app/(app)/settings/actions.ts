"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto";
import { ensureAppSettings } from "@/lib/settings";
import { syncDriveTree } from "@/lib/library-sync";
import {
  getDriveItem,
  getRootFolderId,
  getServiceAccountEmail,
  isDriveConfigured,
  listFolderChildren,
  parseDriveFolderId,
} from "@/lib/drive";
import { Role } from "@/generated/prisma/client";
import { isLeadership } from "@/lib/roles";
import { getSession, destroyOtherSessions } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { randomToken, expiresInHours } from "@/lib/tokens";
import { verificationEmail, sendMail, sendTestEmail, getSmtpConfig, type SmtpConfig } from "@/lib/email";
import { parseForm, type ActionState } from "@/lib/form";
import { z } from "zod";
import { profileSchema, changePasswordSchema, changeEmailSchema, smtpSchema, attendancePolicySchema } from "@/lib/validation";

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

// ---------------------------------------------------------------------------
// Google Drive (admin only): root folder, access test, manual sync, credentials.
// ---------------------------------------------------------------------------

const ADMIN_ONLY = [Role.ADMIN] as const;

export async function saveDriveRootAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...ADMIN_ONLY);
  const raw = String(formData.get("root") ?? "");
  const folderId = parseDriveFolderId(raw);
  if (!folderId) return { fieldErrors: { root: "Paste the folder's Drive URL or its id." } };

  let name = folderId;
  if (await isDriveConfigured()) {
    try {
      const meta = await getDriveItem(folderId);
      if (!meta.isFolder) return { fieldErrors: { root: "That id points to a file, not a folder." } };
      name = meta.name;
    } catch {
      const sa = await getServiceAccountEmail();
      return {
        fieldErrors: {
          root: `The service account can't see that folder. Share it with ${sa ?? "the service account"} (Editor) and try again.`,
        },
      };
    }
  }
  const id = await ensureAppSettings();
  await prisma.appSettings.update({ where: { id }, data: { driveRootFolderId: folderId, driveIndexFileId: null } });
  await logAudit({ actorId: user.id, action: "DRIVE_ROOT_CHANGED", target: name, metadata: { folderId } });
  revalidatePath("/settings");
  revalidatePath("/library", "layout");
  return { success: true, message: `Root folder set to “${name}”. Run “Sync now” to import it.` };
}

export async function testDriveAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireRole(...ADMIN_ONLY);
  if (!(await isDriveConfigured())) return { error: "Upload the service-account JSON first." };
  const root = await getRootFolderId();
  if (!root) return { error: "Set the root folder first." };
  try {
    const children = await listFolderChildren(root);
    const folders = children.filter((c) => c.isFolder).map((c) => c.name);
    const files = children.length - folders.length;
    return {
      success: true,
      message: `Access OK. ${folders.length} folder${folders.length === 1 ? "" : "s"} (${folders.slice(0, 12).join(", ")}${folders.length > 12 ? ", …" : ""}) and ${files} file${files === 1 ? "" : "s"} at the top level.`,
    };
  } catch (err) {
    const sa = await getServiceAccountEmail();
    return { error: `Drive said: ${err instanceof Error ? err.message : String(err)}. Is the folder shared with ${sa ?? "the service account"}?` };
  }
}

export async function syncDriveNowAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...ADMIN_ONLY);
  try {
    const r = await syncDriveTree();
    await logAudit({ actorId: user.id, action: "LIBRARY_SYNCED", metadata: r });
    revalidatePath("/library", "layout");
    return {
      success: true,
      message: `Synced: ${r.added} added, ${r.updated} updated, ${r.removed} removed, ${r.pieces} pieces catalogued. index.csv regenerated.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed." };
  }
}

export async function updateDriveCredentialsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...ADMIN_ONLY);
  const file = formData.get("serviceAccount");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { serviceAccount: "Choose the JSON key file." } };
  let json: { client_email?: string; private_key?: string };
  try {
    json = JSON.parse(await file.text());
  } catch {
    return { fieldErrors: { serviceAccount: "Not valid JSON." } };
  }
  if (!json.client_email || !json.private_key) {
    return { fieldErrors: { serviceAccount: "Missing client_email / private_key." } };
  }
  const id = await ensureAppSettings();
  await prisma.appSettings.update({ where: { id }, data: { driveConfigEnc: encryptJson(json) } });
  await logAudit({ actorId: user.id, action: "DRIVE_CREDENTIALS_UPDATED", target: json.client_email });
  revalidatePath("/settings");
  return { success: true, message: `Service account updated (${json.client_email}). Share the Drive folder with it.` };
}

// ---------------------------------------------------------------------------
// Email / SMTP (admin only): view what's configured, rotate the app password,
// send a test to yourself. Mirrors the setup wizard so it survives graduation.
// ---------------------------------------------------------------------------

const smtpUpdateSchema = smtpSchema.extend({
  // Blank = keep the password already on file.
  appPassword: z.string().optional(),
});

export async function saveSmtpSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...ADMIN_ONLY);
  const parsed = parseForm(smtpUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const current = await getSmtpConfig();
  const appPassword = parsed.data.appPassword?.trim() || current?.appPassword;
  if (!appPassword) return { fieldErrors: { appPassword: "Enter the Gmail app password." } };

  const cfg: SmtpConfig = {
    host: parsed.data.host,
    port: parsed.data.port,
    user: parsed.data.user,
    appPassword,
    fromName: parsed.data.fromName?.trim() || undefined,
  };
  const id = await ensureAppSettings();
  await prisma.appSettings.update({ where: { id }, data: { smtpConfigEnc: encryptJson(cfg) } });
  await logAudit({ actorId: user.id, action: "SMTP_UPDATED", target: cfg.user });
  revalidatePath("/settings");
  return { success: true, message: `Email settings saved for ${cfg.user}.` };
}

export async function testSmtpSettingsAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...ADMIN_ONLY);
  const cfg = await getSmtpConfig();
  if (!cfg) return { error: "Email isn't configured yet — fill in the form above first." };
  try {
    await sendTestEmail(cfg, user.email);
    return { success: true, message: `Test email sent from ${cfg.user} to ${user.email}. Check your inbox (and spam).` };
  } catch (err) {
    return { error: `Gmail rejected the send: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Attendance policy (admin only): who students email about a conflict.
// ---------------------------------------------------------------------------

export async function saveAttendancePolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...ADMIN_ONLY);
  const parsed = parseForm(attendancePolicySchema, formData);
  if (!parsed.ok) return parsed.state;

  let cc: { id: string; name: string } | null = null;
  if (parsed.data.absenceCcUserId) {
    const target = await prisma.user.findUnique({
      where: { id: parsed.data.absenceCcUserId },
      select: { id: true, name: true, role: true },
    });
    if (!target || !isLeadership(target.role)) {
      return { fieldErrors: { absenceCcUserId: "Pick a drum major or admin from the portal." } };
    }
    cc = target;
  }

  const id = await ensureAppSettings();
  await prisma.appSettings.update({
    where: { id },
    data: {
      absenceContactName: parsed.data.absenceContactName,
      absenceContactEmail: parsed.data.absenceContactEmail ?? null,
      absenceCcUserId: cc?.id ?? null,
    },
  });
  await logAudit({
    actorId: user.id,
    action: "ATTENDANCE_POLICY_UPDATED",
    target: `${parsed.data.absenceContactName} / cc ${cc?.name ?? "nobody"}`,
  });
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { success: true, message: "Conflict contacts saved." };
}
