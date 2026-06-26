import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/settings";
import { unreadCount } from "@/lib/notify";
import { Role } from "@/generated/prisma/client";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const { user, impersonating } = await requireAuth();

  const canInvite = user.role === Role.ADMIN || user.role === Role.DRUM_MAJOR;
  const canMusic = canInvite || user.role === Role.LIBRARIAN;
  const isAdmin = user.role === Role.ADMIN;
  const unread = await unreadCount(user.id);

  return (
    <div className="flex min-h-screen">
      <AppSidebar canInvite={canInvite} canMusic={canMusic} />
      <div className="flex min-h-full flex-1 flex-col">
        {impersonating ? <ImpersonationBanner targetName={user.name} /> : null}
        <header className="flex items-center justify-end gap-2 border-b border-border px-4 py-2.5 pl-16 md:pl-4">
          <Link
            href="/notifications"
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
            className="relative grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Bell className="size-5" />
            {unread > 0 ? (
              <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <UserMenu
            name={user.name}
            canInvite={canInvite}
            isAdmin={isAdmin}
            logoutAction={logoutAction}
          />
        </header>
        <main className="flex-1 px-4 py-8 md:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
