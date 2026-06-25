"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { createEventAction } from "./actions";

export function EventForm() {
  const [state, formAction] = useActionState(createEventAction, emptyState);
  return (
    <form action={formAction} className="grid gap-4">
      <Field label="Title" name="title" error={state.fieldErrors?.title} required />
      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" name="date" type="date" error={state.fieldErrors?.date} required />
        <Field label="Time" name="time" type="time" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify" />
        Notify everyone (sends an announcement + in-app notification)
      </label>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving…">Add event</SubmitButton>
      </div>
    </form>
  );
}
