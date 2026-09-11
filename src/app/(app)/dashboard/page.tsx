import Link from "next/link";
import {
  CalendarDays,
  CalendarCheck,
  Megaphone,
  Music,
  ListChecks,
  Lightbulb,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";
import { TaskStatus, EventAudience } from "@/generated/prisma/client";
import { formatEventDate, todayUtc } from "../events/event-dates";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel } from "../announcements/status";

export const metadata = { title: "Dashboard — Drum Major Portal" };

export default async function DashboardPage() {
  const { user } = await requireAuth();
  const now = new Date();
  const todayStart = todayUtc();

  // "Open" = not completed AND (mine OR nobody's). Unassigned tasks are everyone's
  // problem, so they show up for every leader until someone claims them.
  const openTasksWhere = {
    status: { not: TaskStatus.COMPLETED },
    OR: [{ assigneeId: user.id }, { assigneeId: null }],
  };

  const [events, announcements, music, openTasks, ideas, unread, eventCount, openTaskCount, dmEvents] =
    await Promise.all([
      prisma.event.findMany({
        where: { date: { gte: todayStart }, audience: EventAudience.BAND },
        orderBy: { date: "asc" },
        take: 5,
      }),
      prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.libraryItem.findMany({
        where: { type: "FILE" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true },
      }),
      prisma.task.findMany({
        where: openTasksWhere,
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { assignee: { select: { name: true } } },
      }),
      prisma.note.findMany({
        orderBy: { votes: { _count: "desc" } },
        take: 5,
        include: { _count: { select: { votes: true } } },
      }),
      unreadCount(user.id),
      prisma.event.count({ where: { date: { gte: todayStart } } }),
      prisma.task.count({ where: openTasksWhere }),
      prisma.event.findMany({
        where: { date: { gte: todayStart }, audience: EventAudience.DRUM_MAJORS },
        orderBy: { date: "asc" },
        take: 5,
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

  const cardTitle = "flex items-center gap-2 text-sm uppercase tracking-wide";

  return (
    <div className="grid gap-6">
      {/* Scoreboard hero */}
      <section className="field-grid rounded-lg border border-border bg-card px-6 py-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Dashboard · {today}</p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight uppercase">
              Welcome, {user.name}
            </h1>
          </div>
          <Link href="/guide" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <BookOpen data-icon="inline-start" />
            Quick start guide
          </Link>
        </div>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className={cardTitle}>
              <CalendarDays className="size-4 text-primary" />
              Upcoming events
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {events.length === 0 ? (
              <CardDescription>None scheduled.</CardDescription>
            ) : (
              events.map((e) => (
                <Link key={e.id} href="/events" className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{e.title}</span>
                  <span className="shrink-0 text-muted-foreground">{formatEventDate(e.date, { weekday: "short" })}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className={cardTitle}>
              <CalendarCheck className="size-4 text-primary" />
              <Link href="/dm-events" className="hover:underline">
                Drum major events
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {dmEvents.length === 0 ? (
              <CardDescription>None scheduled.</CardDescription>
            ) : (
              dmEvents.map((e) => (
                <Link key={e.id} href="/dm-events" className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{e.title}</span>
                  <span className="shrink-0 text-muted-foreground">{formatEventDate(e.date, { weekday: "short" })}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className={cardTitle}>
              <Megaphone className="size-4 text-primary" />
              Recent announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {announcements.length === 0 ? (
              <CardDescription>None yet.</CardDescription>
            ) : (
              announcements.map((a) => (
                <Link key={a.id} href={`/announcements/${a.id}`} className="flex justify-between gap-2 hover:underline">
                  <span className="truncate">{a.subject}</span>
                  <span className="shrink-0 text-muted-foreground">{statusLabel(a.status)}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className={cardTitle}>
              <ListChecks className="size-4 text-primary" />
              <Link href="/tasks" className="hover:underline">
                Open tasks
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {openTasks.length === 0 ? (
              <CardDescription>Nothing open. Nice.</CardDescription>
            ) : (
              openTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {t.status === TaskStatus.IN_PROGRESS ? (
                      <span className="text-xs text-muted-foreground">In progress</span>
                    ) : null}
                    {t.assignee ? (
                      <Badge variant="outline">{t.assignee.name}</Badge>
                    ) : (
                      <Badge variant="secondary">Unassigned</Badge>
                    )}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className={cardTitle}>
              <Music className="size-4 text-primary" />
              Recent files
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            {music.length === 0 ? (
              <CardDescription>None yet.</CardDescription>
            ) : (
              music.map((m) => (
                <Link key={m.id} href={`/library/${m.id}`} className="truncate hover:underline">
                  {m.name}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary">
          <CardHeader>
            <CardTitle className={cardTitle}>
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
