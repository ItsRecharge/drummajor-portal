"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FolderPlus, Upload, RefreshCw, Music } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import { createFolderAction, uploadFilesAction, syncDriveAction } from "./actions";

export function LibraryToolbar({ parentId, isRoot = false }: { parentId: string | null; isRoot?: boolean }) {
  const [showNew, setShowNew] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [syncState, syncAction] = useActionState(syncDriveAction, emptyState);

  useEffect(() => {
    if (syncState.success) toast.success(syncState.message ?? "Synced.");
    else if (syncState.error) toast.error(syncState.error);
  }, [syncState]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isRoot ? (
        <Link href="/library/new" className={buttonVariants({ size: "sm" })}>
          <Music data-icon="inline-start" />
          Add music
        </Link>
      ) : null}

      {showNew ? (
        <form
          action={createFolderAction}
          onSubmit={() => setShowNew(false)}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="parentId" value={parentId ?? ""} />
          <input
            name="name"
            autoFocus
            placeholder="Folder name"
            className="h-8 w-44 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            onBlur={(e) => {
              if (!e.currentTarget.value) setShowNew(false);
            }}
          />
          <SubmitButton pendingLabel="…">
            <FolderPlus className="size-4" />
            Create
          </SubmitButton>
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setShowNew(true)}>
          <FolderPlus className="size-4" />
          New folder
        </Button>
      )}

      <form action={uploadFilesAction}>
        <input type="hidden" name="parentId" value={parentId ?? ""} />
        <input
          ref={fileInput}
          type="file"
          name="files"
          multiple
          className="hidden"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          Upload
        </Button>
      </form>

      <form action={syncAction} className="ml-auto">
        <SubmitButton variant="ghost" pendingLabel="Syncing…" className="h-7 px-2 text-xs">
          <RefreshCw className="size-3.5" />
          Sync with Drive
        </SubmitButton>
      </form>
    </div>
  );
}
