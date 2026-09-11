"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Upload, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { emptyState, type ActionState } from "@/lib/form";
import { CATEGORY_LABELS, MUSIC_CATEGORIES, suggestParts, type CreditType, type MusicCategory } from "@/lib/music-naming";
import { PartsPicker } from "./parts-picker";
import { addPartsAction, deletePieceAction, renamePartAction, updatePieceAction } from "./actions";

export type PieceMeta = {
  id: string;
  folderId: string;
  title: string;
  credit: string | null;
  creditType: CreditType | null;
  category: MusicCategory;
};

function useToastOnResult(state: ActionState, onSuccess?: () => void) {
  useEffect(() => {
    if (state.success) {
      toast.success(state.message ?? "Done.");
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

// Shared category + title + credit fields (Add music and Edit details).
export function PieceFields({
  defaults,
  errors,
  onCategoryChange,
  onTitleChange,
}: {
  defaults?: Partial<PieceMeta>;
  errors?: Record<string, string>;
  onCategoryChange?: (c: MusicCategory) => void;
  onTitleChange?: (t: string) => void;
}) {
  const [creditType, setCreditType] = useState<CreditType>(defaults?.creditType ?? "ARRANGER");
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            defaultValue={defaults?.category ?? "CONCERT_BAND"}
            onChange={(e) => onCategoryChange?.(e.target.value as MusicCategory)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {MUSIC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          {errors?.category ? <p className="text-sm text-destructive">{errors.category}</p> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={defaults?.title ?? ""}
            onChange={(e) => onTitleChange?.(e.target.value)}
            required
            aria-invalid={!!errors?.title}
          />
          {errors?.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="grid gap-1.5">
          <Label>Credit</Label>
          <div className="flex rounded-md border p-0.5" role="radiogroup">
            {(["ARRANGER", "COMPOSER"] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded px-3 py-1 text-sm ${creditType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <input
                  type="radio"
                  name="creditType"
                  value={t}
                  checked={creditType === t}
                  onChange={() => setCreditType(t)}
                  className="sr-only"
                />
                {t === "ARRANGER" ? "Arranger" : "Composer"}
              </label>
            ))}
          </div>
        </div>
        <Field
          label={creditType === "ARRANGER" ? "Arranger's name" : "Composer's name"}
          name="credit"
          defaultValue={defaults?.credit ?? ""}
          placeholder="Leave blank if unknown"
          error={errors?.credit}
        />
      </div>
    </div>
  );
}

export function EditPieceDialog({ piece }: { piece: PieceMeta }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updatePieceAction, emptyState);
  useToastOnResult(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil data-icon="inline-start" />
        Edit details
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={action} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
            <DialogDescription>
              Renames the folder in Google Drive (and the part files if the title changes).
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="pieceId" value={piece.id} />
          <PieceFields defaults={piece} errors={state.fieldErrors} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePieceButton({ piece }: { piece: PieceMeta }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Trash2 data-icon="inline-start" />
        Delete piece
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{piece.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes the folder and every part PDF from Google Drive. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deletePieceAction}>
          <input type="hidden" name="folderId" value={piece.folderId} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Delete from Drive
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Upload more part PDFs into an existing piece.
export function AddPartsForm({ piece }: { piece: PieceMeta }) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, action] = useActionState(addPartsAction, emptyState);
  useToastOnResult(state, () => setFiles([]));
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="folderId" value={piece.folderId} />
      <div className="grid gap-1.5">
        <Label htmlFor="add-parts-files">Part PDFs</Label>
        <input
          id="add-parts-files"
          name="files"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </div>
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="grid gap-2 rounded-md border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ListMusic className="size-4 text-primary" />
            {f.name}
          </p>
          <PartsPicker
            name={`parts-${i}`}
            category={piece.category}
            title={piece.title}
            initial={suggestParts(f.name, piece.category)}
            compact
          />
        </div>
      ))}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {files.length > 0 ? (
        <div>
          <SubmitButton pendingLabel="Uploading…">
            <Upload data-icon="inline-start" />
            Add {files.length} file{files.length === 1 ? "" : "s"}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function EditPartsDialog({
  fileId,
  fileName,
  piece,
  initial,
}: {
  fileId: string;
  fileName: string;
  piece: PieceMeta;
  initial: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(renamePartAction, emptyState);
  useToastOnResult(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Edit parts for ${fileName}`} />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={action} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Which parts are in this file?</DialogTitle>
            <DialogDescription className="font-mono text-xs">{fileName}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="fileId" value={fileId} />
          <PartsPicker name="parts" category={piece.category} title={piece.title} initial={initial} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <SubmitButton pendingLabel="Renaming…">Rename file</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
