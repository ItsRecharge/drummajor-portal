"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  applyPending,
  countStatuses,
  type AttendanceStatus,
  type SheetSnapshot,
} from "@/lib/attendance";
import { todayUtcInZone } from "@/lib/event-schedule";
import { markAllAction, markAttendanceAction, type MarkResult } from "./actions";
import { PublishButton } from "./publish-button";

// Selected-state colours per status; unselected buttons share a quiet outline.
const SELECTED: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-success-foreground border-success",
  LATE: "bg-amber-500 text-black border-amber-500 dark:bg-amber-400",
  EXCUSED: "bg-secondary text-secondary-foreground border-secondary",
  ABSENT: "bg-destructive text-white border-destructive",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Every tap saves at once and is pushed to every drum major on the sheet over
// Server-Sent Events. `base` is the last snapshot from the server (page props,
// then the stream or an action result); `pending` holds taps still in flight
// so the button doesn't flicker while the round trip completes.
export function AttendanceSheet({
  eventId,
  initial,
  viewerName,
}: {
  eventId: string;
  initial: SheetSnapshot;
  viewerName: string;
}) {
  const [base, setBase] = useState(initial);
  const [pending, setPending] = useState<Map<string, AttendanceStatus>>(() => new Map());
  const [others, setOthers] = useState<string[]>([]);
  const [live, setLive] = useState(true);
  const [filter, setFilter] = useState("");
  const [isPending, startTransition] = useTransition();
  // Per-student tap counter: only the latest tap may clear its pending mark.
  const seq = useRef(new Map<string, number>());

  // Snapshots can arrive out of order (a reconnect, an action result); only
  // newer ones replace what's shown.
  const applySnapshot = (snap: SheetSnapshot) => setBase((prev) => (snap.version >= prev.version ? snap : prev));

  useEffect(() => {
    const es = new EventSource(`/events/${eventId}/attendance/live`);
    es.addEventListener("snapshot", (e) => {
      applySnapshot(JSON.parse((e as MessageEvent<string>).data) as SheetSnapshot);
      setLive(true);
    });
    es.addEventListener("presence", (e) => {
      const { names } = JSON.parse((e as MessageEvent<string>).data) as { names: string[] };
      setOthers(names.filter((n) => n !== viewerName));
    });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [eventId, viewerName]);

  const rows = useMemo(() => applyPending(base.rows, pending), [base.rows, pending]);
  const counts = useMemo(() => countStatuses(rows.map((r) => r.status)), [rows]);
  const q = filter.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.instrument.toLowerCase().includes(q))
    : rows;

  const settle = (res: MarkResult, contactId?: string, tap?: number) => {
    if (res.ok) applySnapshot(res.snapshot);
    else toast.error(res.error);
    if (contactId && seq.current.get(contactId) === tap) {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(contactId);
        return next;
      });
    }
  };

  const mark = (contactId: string, status: AttendanceStatus) => {
    const tap = (seq.current.get(contactId) ?? 0) + 1;
    seq.current.set(contactId, tap);
    setPending((prev) => new Map(prev).set(contactId, status));
    startTransition(async () => settle(await markAttendanceAction(eventId, contactId, status), contactId, tap));
  };

  const markAll = (status: AttendanceStatus) =>
    startTransition(async () => settle(await markAllAction(eventId, status)));

  const saving = isPending || pending.size > 0;
  const started = base.takenAt !== null;
  const eventPast = base.eventDay <= todayUtcInZone(new Date()).toISOString().slice(0, 10);
  const publishBlocked = !started ? "Mark attendance first." : !eventPast ? "The event hasn't happened yet." : null;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody is in {base.groups.join(" or ")} yet. Import the roster from Google Classroom first.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <span
            className={cn("size-2 rounded-full", live ? "bg-success" : "bg-amber-500")}
            aria-hidden
          />
          <span className="text-muted-foreground">
            {!started
              ? "Not started — tap a student to begin. Every tap saves for everyone."
              : saving
                ? "Saving…"
                : `All changes saved · last change ${base.takenAt ? formatTime(base.takenAt) : ""}`}
            {live ? "" : " · Reconnecting…"}
          </span>
        </span>
        {others.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Users className="size-3.5" /> Also here: {others.join(", ")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
        {base.publishedAt ? (
          <p className="text-sm">
            <strong>Published</strong> {formatTime(base.publishedAt)}
            {base.publishedBy ? ` by ${base.publishedBy}` : ""}. Anyone marked absent from now on is emailed within a
            minute.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Absent students are emailed only when someone publishes this sheet.
            </p>
            <PublishButton
              eventId={eventId}
              absent={counts.absent}
              present={counts.present}
              disabledReason={publishBlocked}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Find a student"
            placeholder="Find a student…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => markAll("PRESENT")}>
            Mark all present
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
              Mark all absent
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Mark everyone absent?</AlertDialogTitle>
                <AlertDialogDescription>
                  This replaces every mark on the sheet, including ones other drum majors made.
                  {base.publishedAt ? " The sheet is published, so absent students are emailed within a minute." : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep marks</AlertDialogCancel>
                <AlertDialogCancel variant="destructive" onClick={() => markAll("ABSENT")}>
                  Mark all absent
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span>
          <strong className="text-foreground">{counts.present}</strong> present
        </span>
        <span>
          <strong className="text-foreground">{counts.late}</strong> late
        </span>
        <span>
          <strong className="text-foreground">{counts.excused}</strong> excused
        </span>
        <span>
          <strong className="text-foreground">{counts.absent}</strong> absent
        </span>
        <span className="ml-auto">{rows.length} expected</span>
      </p>

      <ul className="divide-y rounded-lg border">
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">No one matches “{filter}”.</li>
        ) : null}
        {visible.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-medium">
                {r.name}
                {r.emailedAt ? (
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-label="Absence email sent" />
                ) : null}
              </p>
              {r.instrument ? <p className="truncate text-xs text-muted-foreground">{r.instrument}</p> : null}
            </div>
            <div role="radiogroup" aria-label={`${r.name} status`} className="flex overflow-hidden rounded-md border">
              {ATTENDANCE_STATUSES.map((s) => {
                const on = s === r.status;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => mark(r.id, s)}
                    className={cn(
                      "h-8 border-r px-2.5 text-xs font-medium transition-colors last:border-r-0",
                      on ? SELECTED[s] : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {ATTENDANCE_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
