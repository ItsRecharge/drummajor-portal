"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import {
  updateProfileAction,
  changePasswordAction,
  changeEmailAction,
  logoutOtherDevicesAction,
} from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.success) return <p className="text-sm text-success">{state.message}</p>;
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  return null;
}

export function ProfileForm({
  name,
  instrument,
  gradYear,
}: {
  name: string;
  instrument: string;
  gradYear?: number;
}) {
  const [state, action] = useActionState(updateProfileAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Name" name="name" defaultValue={name} error={state.fieldErrors?.name} required />
      <Field label="Instrument" name="instrument" defaultValue={instrument} error={state.fieldErrors?.instrument} />
      <Field label="Graduation year" name="gradYear" type="number" defaultValue={gradYear} error={state.fieldErrors?.gradYear} />
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" error={state.fieldErrors?.currentPassword} required />
      <Field label="New password" name="newPassword" type="password" autoComplete="new-password" error={state.fieldErrors?.newPassword} required />
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Updating…">Change password</SubmitButton>
      </div>
    </form>
  );
}

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useActionState(changeEmailAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Current email</span>
        <span className="text-sm text-muted-foreground">{currentEmail}</span>
      </div>
      <Field label="New email" name="newEmail" type="email" error={state.fieldErrors?.newEmail} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} required />
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Sending…">Change email</SubmitButton>
      </div>
    </form>
  );
}

export function LogoutOthers() {
  const [state, action] = useActionState(logoutOtherDevicesAction, emptyState);
  return (
    <form action={action} className="grid gap-3">
      <Result state={state} />
      <div>
        <SubmitButton variant="outline" pendingLabel="Signing out…">
          Log out other devices
        </SubmitButton>
      </div>
    </form>
  );
}
