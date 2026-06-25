"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { SubmitButton } from "@/components/submit-button";
import { addFilesAction } from "./actions";

// Upload one or more PDFs into a piece. When `replaceFileId` is set, the upload
// supersedes that file as a new version.
export function FileUploadForm({
  pieceId,
  replaceFileId,
  label = "Upload",
}: {
  pieceId: string;
  replaceFileId?: string;
  label?: string;
}) {
  const [state, formAction] = useActionState(addFilesAction, emptyState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="pieceId" value={pieceId} />
      {replaceFileId ? <input type="hidden" name="replaceFileId" value={replaceFileId} /> : null}
      <input type="file" name="files" accept="application/pdf,.pdf" multiple={!replaceFileId} className="text-sm" />
      <SubmitButton variant="outline" pendingLabel="Uploading…">
        {label}
      </SubmitButton>
      {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="w-full text-sm text-green-600">{state.message}</p> : null}
    </form>
  );
}
