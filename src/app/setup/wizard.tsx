"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import {
  saveOrgAction,
  createFirstAdminAction,
  testSmtpAction,
  saveSmtpAction,
  finishSetupAction,
} from "./actions";

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function FormOk({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-green-600">{message}</p>;
}

export function OrgStep() {
  const [state, action] = useActionState(saveOrgAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <Field label="School name" name="schoolName" error={state.fieldErrors?.schoolName} required />
      <Field label="Band name" name="bandName" error={state.fieldErrors?.bandName} required />
      <Field
        label="Slug"
        name="slug"
        placeholder="winchester-band"
        error={state.fieldErrors?.slug}
        required
      />
      <Field
        label="Web address"
        name="baseUrl"
        type="url"
        placeholder="https://portal.example.org"
        error={state.fieldErrors?.baseUrl}
        required
      />
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}

export function AdminStep() {
  const [state, action] = useActionState(createFirstAdminAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Your name" name="name" error={state.fieldErrors?.name} required />
      <Field
        label="School email"
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
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        required
      />
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Creating…">Create admin</SubmitButton>
    </form>
  );
}

export function SmtpStep() {
  const [testState, testAction] = useActionState(testSmtpAction, emptyState);
  const [saveState, saveAction] = useActionState(saveSmtpAction, emptyState);
  const fieldErrors = { ...testState.fieldErrors, ...saveState.fieldErrors };
  return (
    <form className="grid gap-4">
      <Field label="SMTP host" name="host" defaultValue="smtp.gmail.com" error={fieldErrors.host} />
      <Field label="Port" name="port" type="number" defaultValue={587} error={fieldErrors.port} />
      <Field
        label="Band email"
        name="user"
        type="email"
        error={fieldErrors.user}
        placeholder="band@winchesterps.org"
      />
      <Field
        label="App password"
        name="appPassword"
        type="password"
        error={fieldErrors.appPassword}
      />
      <Field label="From name (optional)" name="fromName" error={fieldErrors.fromName} />
      <FormError message={testState.error ?? saveState.error} />
      <FormOk message={testState.message} />
      <div className="flex gap-3">
        <SubmitButton formAction={testAction} variant="outline" pendingLabel="Sending…">
          Send test email
        </SubmitButton>
        <SubmitButton formAction={saveAction} pendingLabel="Saving…">
          Save &amp; continue
        </SubmitButton>
      </div>
    </form>
  );
}

export function DriveStep() {
  const [state, action] = useActionState(finishSetupAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Upload the Google Drive service-account JSON to enable the music library, or skip and set it
        up later. (Folder &amp; Shared-Drive setup happens in a later stage.)
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="serviceAccount" className="text-sm font-medium">
          Service-account JSON
        </label>
        <input
          id="serviceAccount"
          name="serviceAccount"
          type="file"
          accept="application/json,.json"
          className="text-sm"
        />
        {state.fieldErrors?.serviceAccount ? (
          <p className="text-sm text-destructive">{state.fieldErrors.serviceAccount}</p>
        ) : null}
      </div>
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Finishing…">Finish setup</SubmitButton>
    </form>
  );
}
