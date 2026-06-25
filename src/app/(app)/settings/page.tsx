import { requireAuth } from "@/lib/auth";
import { getSession, listSessions } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm, PasswordForm, EmailForm, LogoutOthers } from "./settings-forms";

export const metadata = { title: "Settings — Drum Major Portal" };

export default async function SettingsPage() {
  const { user } = await requireAuth();
  const [current, sessions] = await Promise.all([getSession(), listSessions(user.id)]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

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
