"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { emptyState } from "@/lib/form";
import { forgotPasswordAction } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, emptyState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.success ? (
          <p className="text-sm text-green-600">{state.message}</p>
        ) : (
          <form action={action} className="grid gap-4">
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              error={state.fieldErrors?.email}
              required
            />
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
            <Link href="/login" className="text-sm text-muted-foreground underline">
              Back to sign in
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
