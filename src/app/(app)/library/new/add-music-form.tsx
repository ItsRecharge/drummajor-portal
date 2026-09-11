"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ListMusic } from "lucide-react";
import { emptyState } from "@/lib/form";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { suggestParts, type MusicCategory } from "@/lib/music-naming";
import { PieceFields } from "../piece-forms";
import { PartsPicker } from "../parts-picker";
import { createPieceAction } from "../actions";

export function AddMusicForm() {
  const [state, action] = useActionState(createPieceAction, emptyState);
  const [category, setCategory] = useState<MusicCategory>("CONCERT_BAND");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  return (
    <form action={action} className="grid gap-6">
      <PieceFields errors={state.fieldErrors} onCategoryChange={setCategory} onTitleChange={setTitle} />

      <div className="grid gap-1.5">
        <Label htmlFor="files">Part PDFs</Label>
        <input
          id="files"
          name="files"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          required
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-xs text-muted-foreground">
          One PDF per part or per range of parts. The portal suggests parts from the file name; fix them if it guessed wrong.
        </p>
      </div>

      {files.length > 0 ? (
        <div className="grid gap-3">
          {files.map((f, i) => (
            <div key={`${category}-${f.name}-${i}`} className="grid gap-2 rounded-md border p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ListMusic className="size-4 text-primary" />
                {f.name}
              </p>
              <PartsPicker
                name={`parts-${i}`}
                category={category}
                title={title}
                initial={suggestParts(f.name, category)}
                compact
              />
            </div>
          ))}
        </div>
      ) : null}

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Adding…">Add music</SubmitButton>
        <Link href="/library" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
