"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { uploadDocumentAction } from "./actions";

export function UploadForm() {
  const [state, formAction] = useActionState(uploadDocumentAction, emptyState);
  return (
    <form action={formAction} className="grid gap-4">
      <Field label="Title" name="title" error={state.fieldErrors?.title} required />
      <Field label="Category (optional)" name="category" placeholder="Handbook, Routes, Budgets…" />
      <div className="grid gap-1.5">
        <Label htmlFor="file">File</Label>
        <input id="file" type="file" name="file" className="text-sm" />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm text-green-600">{state.message}</p> : null}
      <div>
        <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
      </div>
    </form>
  );
}
