"use client";

import { useActionState } from "react";
import Link from "next/link";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { RichText } from "@/components/rich-text";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { updateTemplateAction, uploadImageAction } from "../actions";

export function TemplateForm({
  template,
}: {
  template: { id: string; name: string; subject: string; bodyHtml: string };
}) {
  const [state, formAction] = useActionState(updateTemplateAction, emptyState);

  async function handleImageUpload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    return uploadImageAction(fd);
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="templateId" value={template.id} />
      <Field label="Template name" name="templateName" defaultValue={template.name} error={state.fieldErrors?.templateName} required />
      <Field label="Subject" name="subject" defaultValue={template.subject} error={state.fieldErrors?.subject} required />
      <div className="grid gap-1.5">
        <Label>Message</Label>
        <RichText name="bodyHtml" initialHtml={template.bodyHtml} onImageUpload={handleImageUpload} />
        {state.fieldErrors?.bodyHtml ? <p className="text-sm text-destructive">{state.fieldErrors.bodyHtml}</p> : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">Save template</SubmitButton>
        <Link href={`/announcements/new?template=${template.id}`} className={buttonVariants({ variant: "outline" })}>
          Use it now
        </Link>
        <Link href="/announcements/templates" className={buttonVariants({ variant: "ghost" })}>
          Back
        </Link>
      </div>
    </form>
  );
}
