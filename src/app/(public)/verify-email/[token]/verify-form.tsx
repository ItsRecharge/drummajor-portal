"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import { verifyEmailAction } from "../../actions";

// Verification is confirmed by a button (POST) rather than on page load, so link
// prefetch can't accidentally consume the token.
export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton pendingLabel="Verifying…">Confirm email address</SubmitButton>
    </form>
  );
}
