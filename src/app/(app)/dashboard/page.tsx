import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";
import { TaskStatus } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel } from "../announcements/status";

export const metadata = { title: "Dashboard — Drum Major Portal" };

export default async function DashboardPage() {
  const { user } = await requireAuth();
  const now = new Date();

  const [events, announcements, music, myTasks, unread] = await Promise.all([
    prisma.event.findMany({ where: { date: { gte: now } }, orderBy: { date: "asc" }, take: 5 }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.musicPiece.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.task.findMany({
      where: { assigneeId: user.id, status: { not: TaskStatus.COMPLETED } },
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
    unreadCount(user.id),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
          <p className="text-sm text-muted-foreground">What needs attention today.</p>
        </div>
        <Link href="/notifications" className="text-sm text-muted-foreground hover:text-foreground">
          🔔 {unread} unread
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming events</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {events.length === 0 ? (
              <CardDescription>None scheduled.</CardDescription>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex justify-between">
                  <span className="truncate">{e.title}</span>
                  <span className="shrink-0 text-muted-foreground">{e.date.toLocaleDateString()}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent announcements</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {announcements.length === 0 ? (
              <CardDescription>None yet.</CardDescription>
            ) : (
              announcements.map((a) => (
                <Link key={a.id} href={`/announcements/${a.id}`} className="flex justify-between hover:underline">
                  <span className="truncate">{a.subject}</span>
                  <span className="shrink-0 text-muted-foreground">{statusLabel(a.status)}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New music</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {music.length === 0 ? (
              <CardDescription>None yet.</CardDescription>
            ) : (
              music.map((m) => (
                <Link key={m.id} href={`/music/${m.id}`} className="truncate hover:underline">
                  {m.title}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">My tasks</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {myTasks.length === 0 ? (
              <CardDescription>Nothing assigned.</CardDescription>
            ) : (
              myTasks.map((t) => (
                <div key={t.id} className="flex justify-between">
                  <span className="truncate">{t.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {t.status === TaskStatus.IN_PROGRESS ? "In progress" : "To do"}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
