"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { submitAppealAction } from "../actions";

export function AppealForm({ token }: { token: string }) {
  const [state, action] = useActionState(submitAppealAction, emptyState);
  if (state.success) {
    return <p className="text-sm text-success">{state.message}</p>;
  }
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-1.5">
        <Label htmlFor="reason">Why should this absence be excused?</Label>
        <Textarea
          id="reason"
          name="reason"
          rows={4}
          required
          placeholder="e.g. I emailed Mr. Costello on Monday about my dentist appointment, or I was there but arrived after roll call."
          aria-invalid={!!state.fieldErrors?.reason}
        />
        {state.fieldErrors?.reason ? <p className="text-sm text-destructive">{state.fieldErrors.reason}</p> : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <SubmitButton pendingLabel="Sending…">Send appeal</SubmitButton>
      </div>
    </form>
  );
}
