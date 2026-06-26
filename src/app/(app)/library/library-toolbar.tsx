"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { FolderPlus, Upload, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createFolderAction, uploadFilesAction, refreshFromDriveAction } from "./actions";

function SubmitIcon({ icon: Icon, label }: { icon: typeof Upload; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </Button>
  );
}

export function LibraryToolbar({ parentId }: { parentId: string | null }) {
  const [showNew, setShowNew] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
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
            className="h-9 w-44 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            onBlur={(e) => {
              if (!e.currentTarget.value) setShowNew(false);
            }}
          />
          <SubmitIcon icon={FolderPlus} label="Create" />
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

      <form action={refreshFromDriveAction} className="ml-auto">
        <input type="hidden" name="folderId" value={parentId ?? ""} />
        <SubmitIcon icon={RefreshCw} label="Refresh" />
      </form>
    </div>
  );
}
