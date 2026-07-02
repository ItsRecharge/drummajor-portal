"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/field";
import { emptyState } from "@/lib/form";
import { saveTemplateAction } from "./actions";

// Saves the composer's current subject/body as a named reusable template.
export function SaveTemplateDialog({ subject, bodyHtml }: { subject: string; bodyHtml: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveTemplateAction, emptyState);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Save as template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={formAction} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Save as template</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Saves the current subject and message so you can start from them next time.
            </p>
            <Field
              label="Template name"
              name="templateName"
              error={state.fieldErrors?.templateName}
              required
            />
            <input type="hidden" name="subject" value={subject} />
            <input type="hidden" name="bodyHtml" value={bodyHtml} />
            {state.success ? (
              <p className="text-sm text-muted-foreground">{state.message}</p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
