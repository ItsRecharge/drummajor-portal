"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import { acceptInviteAction } from "../../actions";

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(acceptInviteAction, emptyState);

  if (state.success) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-success">{state.message}</p>
        <Link href="/login" className="text-sm underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <span className="text-sm text-muted-foreground">{email}</span>
      </div>
      <Field label="Your name" name="name" error={state.fieldErrors?.name} required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        required
      />
      <Field label="Instrument (optional)" name="instrument" error={state.fieldErrors?.instrument} />
      <Field
        label="Graduation year (optional)"
        name="gradYear"
        type="number"
        error={state.fieldErrors?.gradYear}
      />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
    </form>
  );
}
