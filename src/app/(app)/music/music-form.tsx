"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

export type PieceDefaults = {
  id?: string;
  title?: string;
  composer?: string;
  arranger?: string;
  ensemble?: string;
  tags?: string;
  notes?: string;
};

type Action = (prev: typeof emptyState, formData: FormData) => Promise<typeof emptyState>;

export function PieceForm({
  action,
  defaults = {},
  withFiles = false,
  submitLabel,
}: {
  action: Action;
  defaults?: PieceDefaults;
  withFiles?: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, emptyState);

  return (
    <form action={formAction} className="grid gap-4">
      {defaults.id ? <input type="hidden" name="pieceId" value={defaults.id} /> : null}
      <Field label="Title" name="title" defaultValue={defaults.title} error={state.fieldErrors?.title} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Composer" name="composer" defaultValue={defaults.composer} />
        <Field label="Arranger" name="arranger" defaultValue={defaults.arranger} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ensemble" name="ensemble" defaultValue={defaults.ensemble} />
        <Field label="Tags (comma-separated)" name="tags" defaultValue={defaults.tags} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={defaults.notes} rows={3} />
      </div>
      {withFiles ? (
        <div className="grid gap-1.5">
          <Label htmlFor="files">PDF files</Label>
          <input id="files" type="file" name="files" accept="application/pdf,.pdf" multiple className="text-sm" />
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-success">{state.message}</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
