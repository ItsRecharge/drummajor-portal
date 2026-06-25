"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import { resetPasswordAction } from "../../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        required
      />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
    </form>
  );
}
