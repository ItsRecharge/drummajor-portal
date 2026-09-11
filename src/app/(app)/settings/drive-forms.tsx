"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw, FlaskConical, Save, KeyRound } from "lucide-react";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import {
  saveDriveRootAction,
  syncDriveNowAction,
  testDriveAction,
  updateDriveCredentialsAction,
} from "./actions";

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Done.");
    else if (state.error) toast.error(state.error);
  }, [state]);
}

function Result({ state }: { state: ActionState }) {
  if (state.success) return <p className="text-sm text-success">{state.message}</p>;
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  return null;
}

export function DriveSettings({
  configured,
  saEmail,
  rootId,
  rootName,
  rootError,
}: {
  configured: boolean;
  saEmail: string | null;
  rootId: string | null;
  rootName: string | null;
  rootError: string | null;
}) {
  const [rootState, rootAction] = useActionState(saveDriveRootAction, emptyState);
  const [testState, testAction] = useActionState(testDriveAction, emptyState);
  const [syncState, syncAction] = useActionState(syncDriveNowAction, emptyState);
  const [credState, credAction] = useActionState(updateDriveCredentialsAction, emptyState);
  useToast(rootState);
  useToast(syncState);
  useToast(credState);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-sm">
        <p>
          <span className="text-muted-foreground">Service account:</span>{" "}
          {configured ? <span className="font-mono">{saEmail}</span> : <span className="text-destructive">not configured</span>}
        </p>
        <p>
          <span className="text-muted-foreground">Root folder:</span>{" "}
          {rootId ? (
            <>
              <span className="font-medium">{rootName ?? "(name unavailable)"}</span>{" "}
              <span className="font-mono text-xs text-muted-foreground">{rootId}</span>
              {rootError ? <span className="ml-2 text-destructive">— {rootError}</span> : null}
            </>
          ) : (
            <span className="text-destructive">not set — paste the Band Music Database folder below</span>
          )}
        </p>
      </div>

      <form action={rootAction} className="grid gap-3">
        <Field
          label="Root folder (Drive URL or id)"
          name="root"
          defaultValue={rootId ?? ""}
          placeholder="https://drive.google.com/drive/folders/…"
          error={rootState.fieldErrors?.root}
        />
        <p className="text-xs text-muted-foreground">
          The folder must be shared with the service account as <strong>Editor</strong>. Students keep
          view-only access; all edits happen here.
        </p>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Saving…">
            <Save data-icon="inline-start" />
            Save root folder
          </SubmitButton>
        </div>
      </form>

      <div className="flex flex-wrap items-start gap-2">
        <form action={testAction}>
          <SubmitButton variant="outline" pendingLabel="Testing…">
            <FlaskConical data-icon="inline-start" />
            Test access
          </SubmitButton>
        </form>
        <form action={syncAction}>
          <SubmitButton variant="outline" pendingLabel="Syncing…">
            <RefreshCw data-icon="inline-start" />
            Sync now
          </SubmitButton>
        </form>
      </div>
      <Result state={testState} />

      <form action={credAction} className="grid gap-3 border-t pt-4">
        <div className="grid gap-1.5">
          <Label htmlFor="serviceAccount">Replace service-account JSON</Label>
          <input
            id="serviceAccount"
            name="serviceAccount"
            type="file"
            accept="application/json,.json"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {credState.fieldErrors?.serviceAccount ? (
            <p className="text-sm text-destructive">{credState.fieldErrors.serviceAccount}</p>
          ) : null}
        </div>
        <div>
          <SubmitButton variant="outline" pendingLabel="Uploading…">
            <KeyRound data-icon="inline-start" />
            Upload key
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
