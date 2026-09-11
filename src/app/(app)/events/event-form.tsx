"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/submit-button";
import { createEventAction } from "./actions";

export function EventForm({ audience }: { audience: "BAND" | "DRUM_MAJORS" }) {
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
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="notify" value="on" />
          Email everyone on the roster (sends an announcement)
        </label>
      )}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving…">{dm ? "Add drum major event" : "Add band event"}</SubmitButton>
      </div>
    </form>
  );
}
