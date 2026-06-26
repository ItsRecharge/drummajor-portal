import Link from "next/link";
import { CalendarDays, Megaphone, Music, ListChecks, Lightbulb, ChevronUp } from "lucide-react";
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

  const [events, announcements, music, myTasks, ideas, unread, eventCount, openTaskCount] =
    await Promise.all([
      prisma.event.findMany({ where: { date: { gte: now } }, orderBy: { date: "asc" }, take: 5 }),
      prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.musicPiece.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.task.findMany({
        where: { assigneeId: user.id, status: { not: TaskStatus.COMPLETED } },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
      prisma.note.findMany({
        orderBy: { votes: { _count: "desc" } },
        take: 5,
        include: { _count: { select: { votes: true } } },
      }),
      unreadCount(user.id),
      prisma.event.count({ where: { date: { gte: now } } }),
      prisma.task.count({
        where: { assigneeId: user.id, status: { not: TaskStatus.COMPLETED } },
      }),
    ]);

  const today = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const stats = [
    { value: eventCount, label: "Upcoming events" },
    { value: unread, label: "Unread" },
    { value: openTaskCount, label: "Open tasks" },
  ];

  return (
    <div className="grid gap-6">
      {/* Scoreboard hero */}
      <section className="field-grid rounded-lg border border-border bg-card/40 px-6 py-7">
        <p className="eyebrow">Dashboard · {today}</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight uppercase">
          Welcome, {user.name}
        </h1>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="stat-numeral text-foreground">{s.value}</div>
              <div className="mt-1 font-mono text-[0.7rem] tracking-widest text-muted-foreground uppercase">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide">
              <CalendarDays className="size-4 text-primary" />
              Upcoming events
            </CardTitle>
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

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide">
              <Megaphone className="size-4 text-primary" />
              Recent announcements
            </CardTitle>
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

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide">
              <Music className="size-4 text-primary" />
              New music
            </CardTitle>
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

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide">
              <ListChecks className="size-4 text-primary" />
              My tasks
            </CardTitle>
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

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide">
              <Lightbulb className="size-4 text-primary" />
              Top ideas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {ideas.length === 0 ? (
              <CardDescription>No ideas yet.</CardDescription>
            ) : (
              ideas.map((n) => (
                <Link key={n.id} href="/notes" className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{n.text}</span>
                  <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground tabular-nums">
                    <ChevronUp className="size-3.5" />
                    {n._count.votes}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
