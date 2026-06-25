"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <Link href="/forgot-password" className="text-sm text-muted-foreground underline">
        Forgot password?
      </Link>
    </form>
  );
}
