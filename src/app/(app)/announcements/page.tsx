import Link from "next/link";
import { FileText, Clock, Send, Plus, LayoutTemplate } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, AnnouncementStatus } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { statusLabel } from "./status";
import { DraftActions, CancelScheduledButton } from "./row-actions";

export const metadata = { title: "Email Announcements — Drum Major Portal" };

type Row = {
  id: string;
  subject: string;
  status: AnnouncementStatus;
  createdAt: Date;
  scheduledAt: Date | null;
  sentAt: Date | null;
  author: { name: string };
  _count: { deliveries: number };
};

const SCHEDULED_STATES: AnnouncementStatus[] = [AnnouncementStatus.SCHEDULED, AnnouncementStatus.PENDING_APPROVAL];

function Section({
  icon: Icon,
  title,
  hint,
  empty,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
          <Icon className="size-4 text-primary" />
          {title}
        </h2>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-2">{children}</div>
      )}
    </section>
  );
}

export default async function AnnouncementsPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);

  const announcements: Row[] = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      createdAt: true,
      scheduledAt: true,
      sentAt: true,
      author: { select: { name: true } },
      _count: { select: { deliveries: true } },
    },
  });

  const openedRows = await prisma.emailDelivery.groupBy({
    by: ["announcementId"],
    where: { openedAt: { not: null } },
    _count: { _all: true },
  });
  const opened = new Map(openedRows.map((r) => [r.announcementId, r._count._all]));

  const drafts = announcements.filter((a) => a.status === AnnouncementStatus.DRAFT);
  const scheduled = announcements
    .filter((a) => SCHEDULED_STATES.includes(a.status))
    .sort((a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));
  const sent = announcements.filter(
    (a) => a.status !== AnnouncementStatus.DRAFT && !SCHEDULED_STATES.includes(a.status),
  );

  const row = (a: Row, right: React.ReactNode) => (
    <Card key={a.id} className="transition-colors hover:bg-accent/40">
      <CardContent className="flex items-center justify-between gap-4 py-3">
        <Link href={`/announcements/${a.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium hover:underline">{a.subject}</p>
          <p className="text-xs text-muted-foreground">
            {a.author.name} · {a.createdAt.toLocaleDateString()}
            {a.scheduledAt && SCHEDULED_STATES.includes(a.status)
              ? ` · sends ${a.scheduledAt.toLocaleString()}`
              : ""}
            {a.sentAt && a.status === AnnouncementStatus.SENT ? ` · sent ${a.sentAt.toLocaleDateString()}` : ""}
            {a._count.deliveries > 0 ? ` · Opened ${opened.get(a.id) ?? 0}/${a._count.deliveries}` : ""}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Email Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Sent from the band email to the class rosters. Drum majors and admins always get a copy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/announcements/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" />
            New announcement
          </Link>
          <Link href="/announcements/templates" className={buttonVariants({ variant: "secondary" })}>
            <LayoutTemplate data-icon="inline-start" />
            From template
          </Link>
        </div>
      </div>

      <Section icon={FileText} title="Drafts" empty="No drafts. Start a new announcement or pick a template.">
        {drafts.map((a) => row(a, <DraftActions id={a.id} subject={a.subject} />))}
      </Section>

      <Section
        icon={Clock}
        title="Scheduled"
        hint="Sends automatically at the scheduled time."
        empty="Nothing scheduled."
      >
        {scheduled.map((a) =>
          row(
            a,
            <>
              <Badge variant="outline">{statusLabel(a.status)}</Badge>
              <CancelScheduledButton id={a.id} subject={a.subject} />
            </>,
          ),
        )}
      </Section>

      <Section icon={Send} title="Sent" empty="Nothing sent yet.">
        {sent.map((a) =>
          row(
            a,
            <Badge variant={a.status === AnnouncementStatus.FAILED ? "destructive" : "outline"}>
              {statusLabel(a.status)}
            </Badge>,
          ),
        )}
      </Section>
    </div>
  );
}
