"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { createEventAction, updateEventAction } from "./actions";

// Prefill for the edit page. `date` is yyyy-mm-dd, `time` HH:MM or "".
export type EventFormInitial = {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  groupIds: string[];
};

export function EventForm({
  audience,
  groups = [],
  initial,
}: {
  audience: "BAND" | "DRUM_MAJORS";
  // Band events only: the built-in class lists, Everyone first.
  groups?: { id: string; name: string }[];
  initial?: EventFormInitial;
}) {
  const [state, formAction] = useActionState(initial ? updateEventAction : createEventAction, emptyState);
  const dm = audience === "DRUM_MAJORS";
  // Everyone is listed first; it's the default, and the fallback for older
  // events that stored no class list.
  const everyone = groups[0] ? [groups[0].id] : [];
  const checked = new Set(initial?.groupIds.length ? initial.groupIds : everyone);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="audience" value={audience} />
      {initial ? <input type="hidden" name="eventId" value={initial.id} /> : null}
      <Field label="Title" name="title" defaultValue={initial?.title} error={state.fieldErrors?.title} required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" name="date" type="date" defaultValue={initial?.date} error={state.fieldErrors?.date} required />
        <Field label="Time" name="time" type="time" defaultValue={initial?.time} />
        <Field
          label="Location"
          name="location"
          defaultValue={initial?.location}
          placeholder="Band room, stadium…"
          error={state.fieldErrors?.location}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="description">Details</Label>
        <Textarea id="description" name="description" rows={3} defaultValue={initial?.description} />
      </div>
      {dm ? (
        <p className="text-sm text-muted-foreground">
          Drum majors and admins get an email with a calendar invite, plus an in-app notification.
        </p>
      ) : (
        <>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Who&apos;s expected</legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <label
                  key={g.id}
                  className="cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={g.id}
                    defaultChecked={checked.has(g.id)}
                    className="sr-only"
                  />
                  {g.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Pick one or more. Everyone covers the whole roster, so it stands alone.
            </p>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            {initial
              ? "Changing the date restarts the reminder emails (a week out, three days out, the morning of). Changing who's expected updates the attendance sheet."
              : "Nothing is emailed when you add it. It goes on the public calendar and into the monthly overview, and those class lists get a reminder a week out, three days out, and the morning of. If the event is today, the day-of email goes out right away."}
          </p>
        </>
      )}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving…">
          {initial ? "Save changes" : dm ? "Add drum major event" : "Add band event"}
        </SubmitButton>
      </div>
    </form>
  );
}
