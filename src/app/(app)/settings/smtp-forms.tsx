"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Send, Save } from "lucide-react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import { saveSmtpSettingsAction, testSmtpSettingsAction } from "./actions";

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Done.");
    else if (state.error) toast.error(state.error);
  }, [state]);
}

export function SmtpSettings({
  configured,
  host,
  port,
  user,
  fromName,
  myEmail,
}: {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  fromName: string;
  myEmail: string;
}) {
  const [saveState, saveAction] = useActionState(saveSmtpSettingsAction, emptyState);
  const [testState, testAction] = useActionState(testSmtpSettingsAction, emptyState);
  useToast(saveState);
  useToast(testState);

  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <span className="text-muted-foreground">Status:</span>{" "}
        {configured ? (
          <>
            sending as <span className="font-mono">{user}</span> via {host}:{port}
          </>
        ) : (
          <span className="text-destructive">not configured — announcements and invites can&apos;t be sent</span>
        )}
      </p>

      <form action={saveAction} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="SMTP host" name="host" defaultValue={host || "smtp.gmail.com"} error={saveState.fieldErrors?.host} required />
          <Field label="Port" name="port" type="number" defaultValue={port || 587} error={saveState.fieldErrors?.port} required />
        </div>
        <Field label="Band Gmail address" name="user" type="email" defaultValue={user} error={saveState.fieldErrors?.user} required />
        <Field
          label={configured ? "Gmail app password (leave blank to keep the current one)" : "Gmail app password"}
          name="appPassword"
          type="password"
          autoComplete="off"
          error={saveState.fieldErrors?.appPassword}
          required={!configured}
        />
        <Field label="From name (optional)" name="fromName" defaultValue={fromName} placeholder="Winchester Bands" error={saveState.fieldErrors?.fromName} />
        <p className="text-xs text-muted-foreground">
          The app password comes from the band Google account: Google Account → Security → 2-Step
          Verification → App passwords. It changes whenever someone resets it, so update it here.
        </p>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Saving…">
            <Save data-icon="inline-start" />
            Save email settings
          </SubmitButton>
        </div>
      </form>

      <form action={testAction} className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton variant="outline" pendingLabel="Sending…">
          <Send data-icon="inline-start" />
          Send a test email to me
        </SubmitButton>
        <span className="text-xs text-muted-foreground">Goes to {myEmail} using the saved settings.</span>
      </form>
    </div>
  );
}
