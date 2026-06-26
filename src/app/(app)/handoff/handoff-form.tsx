"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { RichText } from "@/components/rich-text";
import { SubmitButton } from "@/components/submit-button";
import { createHandoffNoteAction } from "./actions";

export function HandoffForm({ defaultYear }: { defaultYear: number }) {
  const [state, formAction] = useActionState(createHandoffNoteAction, emptyState);
  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Year"
          name="year"
          type="number"
          defaultValue={defaultYear}
          error={state.fieldErrors?.year}
          required
        />
        <div className="grid gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            defaultValue="WHAT_WORKED"
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="WHAT_WORKED">What worked</option>
            <option value="WHAT_DIDNT">What didn&apos;t</option>
            <option value="TIP">Tip</option>
          </select>
        </div>
      </div>
      <Field label="Title" name="title" error={state.fieldErrors?.title} required />
      <div className="grid gap-1.5">
        <Label>Details</Label>
        <RichText name="bodyHtml" />
        {state.fieldErrors?.bodyHtml ? (
          <p className="text-sm text-destructive">{state.fieldErrors.bodyHtml}</p>
        ) : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-success">{state.message}</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving…">Save note</SubmitButton>
      </div>
    </form>
  );
}
