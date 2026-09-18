"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { createEventAction } from "./actions";

export function EventForm({
  audience,
  groups = [],
}: {
  audience: "BAND" | "DRUM_MAJORS";
  // Band events only: the built-in class lists, Everyone first.
  groups?: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(createEventAction, emptyState);
  const dm = audience === "DRUM_MAJORS";
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="audience" value={audience} />
      <Field label="Title" name="title" error={state.fieldErrors?.title} required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" name="date" type="date" error={state.fieldErrors?.date} required />
        <Field label="Time" name="time" type="time" />
        <Field label="Location" name="location" placeholder="Band room, stadium…" error={state.fieldErrors?.location} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="description">Details</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>
      {dm ? (
        <p className="text-sm text-muted-foreground">
          Drum majors and admins get an email with a calendar invite, plus an in-app notification.
        </p>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="groupId">Who&apos;s expected</Label>
            <select
              id="groupId"
              name="groupId"
              defaultValue={groups[0]?.id ?? ""}
              className="h-9 rounded-md border bg-transparent px-3 text-sm sm:max-w-xs"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            That class list is emailed right away only if the event is within a week. Otherwise it goes on
            the public calendar and into the monthly overview, and everyone gets a reminder a week out,
            three days out, and the morning of.
          </p>
        </>
      )}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving…">{dm ? "Add drum major event" : "Add band event"}</SubmitButton>
      </div>
    </form>
  );
}
