import { requireAuth } from "@/lib/auth";
import { getSession, listSessions } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm, PasswordForm, EmailForm, LogoutOthers } from "./settings-forms";
import { DriveSettings } from "./drive-forms";
import { SmtpSettings } from "./smtp-forms";
import { AttendancePolicySettings } from "./attendance-policy-forms";
import { getAppSettings } from "@/lib/settings";
import { DEFAULT_CC_NAME, DEFAULT_CONTACT_NAME } from "@/lib/event-emails";
import { getSmtpConfig } from "@/lib/email";
import { isAdmin } from "@/lib/roles";
import { getDriveItem, getRootFolderId, getServiceAccountEmail, isDriveConfigured } from "@/lib/drive";

export const metadata = { title: "Settings — Drum Major Portal" };

export default async function SettingsPage() {
  const { user } = await requireAuth();
  const [current, sessions] = await Promise.all([getSession(), listSessions(user.id)]);

  // Admin-only Drive card. Resolving the root folder's name hits the Drive API;
  // failures are shown inline rather than breaking the page.
  const admin = isAdmin(user.role);
  const smtp = admin ? await getSmtpConfig() : null;
  const policy = admin ? await getAppSettings() : null;
  let drive: { configured: boolean; saEmail: string | null; rootId: string | null; rootName: string | null; rootError: string | null } | null = null;
  if (admin) {
    const [configured, saEmail, rootId] = await Promise.all([isDriveConfigured(), getServiceAccountEmail(), getRootFolderId()]);
    let rootName: string | null = null;
    let rootError: string | null = null;
    if (configured && rootId) {
      try {
        rootName = (await getDriveItem(rootId)).name;
      } catch (err) {
        rootError = err instanceof Error ? err.message : "could not read the folder";
      }
    }
    drive = { configured, saEmail, rootId, rootName, rootError };
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold tracking-tight uppercase">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name and band details.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={user.name}
            instrument={user.instrument ?? ""}
            gradYear={user.gradYear ?? undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Requires your current password.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Changing your email requires verifying the new address.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailForm currentEmail={user.email} />
        </CardContent>
      </Card>

      {admin ? (
        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle>Email (band Gmail)</CardTitle>
            <CardDescription>
              Announcements, invites, and password resets all go out from this account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SmtpSettings
              configured={!!smtp}
              host={smtp?.host ?? ""}
              port={smtp?.port ?? 587}
              user={smtp?.user ?? ""}
              fromName={smtp?.fromName ?? ""}
              myEmail={user.email}
            />
          </CardContent>
        </Card>
      ) : null}

      {admin ? (
        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle>Attendance policy</CardTitle>
            <CardDescription>
              Who students email about a conflict. Quoted in every event reminder and absence notice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttendancePolicySettings
              contactName={policy?.absenceContactName ?? DEFAULT_CONTACT_NAME}
              contactEmail={policy?.absenceContactEmail ?? ""}
              ccName={policy?.absenceCcName ?? DEFAULT_CC_NAME}
              ccEmail={policy?.absenceCcEmail ?? ""}
            />
          </CardContent>
        </Card>
      ) : null}

      {drive ? (
        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
            <CardDescription>
              Where the music library lives. Point this at the band&apos;s <strong>Band Music Database</strong> folder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DriveSettings {...drive} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <span className="text-muted-foreground">
                  {s.userAgent ?? "Unknown device"}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {s.lastActiveAt.toLocaleString()}
                  </span>
                  {current && s.id === current.id ? <Badge>This device</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
          <LogoutOthers />
        </CardContent>
      </Card>
    </div>
  );
}
