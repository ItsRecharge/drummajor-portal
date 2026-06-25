import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/settings";
import { unreadCount } from "@/lib/notify";
import { Role } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const { user, impersonating } = await requireAuth();

  const canInvite = user.role === Role.ADMIN || user.role === Role.DRUM_MAJOR;
  const canMusic = canInvite || user.role === Role.LIBRARIAN;
  const isAdmin = user.role === Role.ADMIN;
  const unread = await unreadCount(user.id);

  return (
    <div className="flex min-h-full flex-col">
      {impersonating ? <ImpersonationBanner targetName={user.name} /> : null}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Drum Major Portal
          </Link>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          {canInvite ? (
            <Link href="/announcements" className="text-muted-foreground hover:text-foreground">
              Announcements
            </Link>
          ) : null}
          {canMusic ? (
            <Link href="/music" className="text-muted-foreground hover:text-foreground">
              Music
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/events" className="text-muted-foreground hover:text-foreground">
              Events
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/tasks" className="text-muted-foreground hover:text-foreground">
              Tasks
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/notes" className="text-muted-foreground hover:text-foreground">
              Ideas
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/vault" className="text-muted-foreground hover:text-foreground">
              Vault
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/handoff" className="text-muted-foreground hover:text-foreground">
              Handoff
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/rosters" className="text-muted-foreground hover:text-foreground">
              Roster
            </Link>
          ) : null}
          {canInvite ? (
            <Link href="/invites" className="text-muted-foreground hover:text-foreground">
              Invites
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
              Members
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/audit" className="text-muted-foreground hover:text-foreground">
              Logs
            </Link>
          ) : null}
          <Link href="/settings" className="text-muted-foreground hover:text-foreground">
            Settings
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/notifications" className="text-muted-foreground hover:text-foreground">
            🔔{unread > 0 ? ` ${unread}` : ""}
          </Link>
          <span className="text-muted-foreground">{user.name}</span>
          <form action={logoutAction}>
            <Button type="submit" size="sm" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="flex-1 px-4 py-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
