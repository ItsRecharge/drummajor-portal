"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { emptyState } from "@/lib/form";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  countStatuses,
  statusFieldName,
  type AttendanceStatus,
} from "@/lib/attendance";
import { saveAttendanceAction } from "./actions";

export type SheetRow = { id: string; name: string; instrument: string; status: AttendanceStatus };

// Selected-state colours per status; unselected buttons share a quiet outline.
const SELECTED: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-success-foreground border-success",
  LATE: "bg-amber-500 text-black border-amber-500 dark:bg-amber-400",
  EXCUSED: "bg-secondary text-secondary-foreground border-secondary",
  ABSENT: "bg-destructive text-white border-destructive",
};

export function AttendanceSheet({
  eventId,
  groupId,
  rows,
}: {
  eventId: string;
  groupId: string;
  rows: SheetRow[];
}) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.status])),
  );
  const [filter, setFilter] = useState("");
  const [state, formAction] = useActionState(saveAttendanceAction, emptyState);

  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Saved.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const counts = useMemo(() => countStatuses(Object.values(statuses)), [statuses]);
  const q = filter.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.instrument.toLowerCase().includes(q))
    : rows;

  const setAll = (status: AttendanceStatus) =>
    setStatuses(Object.fromEntries(rows.map((r) => [r.id, status])));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody is in this class list yet. Import the roster from Google Classroom first.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="groupId" value={groupId} />
      {/* Every row is submitted even when filtered out of view. */}
      {rows.map((r) => (
        <input key={r.id} type="hidden" name={statusFieldName(r.id)} value={statuses[r.id] ?? "ABSENT"} />
      ))}

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
          <Button type="button" variant="outline" size="sm" onClick={() => setAll("PRESENT")}>
            Mark all present
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll("ABSENT")}>
            Mark all absent
          </Button>
          <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
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
        {visible.map((r) => {
          const current = statuses[r.id] ?? "ABSENT";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                {r.instrument ? <p className="truncate text-xs text-muted-foreground">{r.instrument}</p> : null}
              </div>
              <div role="radiogroup" aria-label={`${r.name} status`} className="flex overflow-hidden rounded-md border">
                {ATTENDANCE_STATUSES.map((s) => {
                  const on = s === current;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setStatuses((prev) => ({ ...prev, [r.id]: s }))}
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
          );
        })}
      </ul>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
      </div>
    </form>
  );
}
