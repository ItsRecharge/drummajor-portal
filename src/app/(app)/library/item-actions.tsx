"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MoreVertical, Pencil, Trash2, ExternalLink, RotateCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import { renameItemAction, deleteItemAction, retryItemAction } from "./actions";

export function ItemActions({
  id,
  name,
  synced,
  errored = false,
}: {
  id: string;
  name: string;
  synced: boolean;
  errored?: boolean;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Wrap the server action so the dialog closes (and toasts) from the submit
  // flow itself rather than from an effect watching the result.
  const [renameState, renameAction] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await renameItemAction(prev, formData);
      if (result.success) {
        toast.success(result.message ?? "Renamed.");
        setRenameOpen(false);
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    },
    emptyState,
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Item actions"
          className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {synced ? (
            <DropdownMenuItem render={<Link href={`/library/${id}/open`} target="_blank" />}>
              <ExternalLink />
              Open in Drive
            </DropdownMenuItem>
          ) : null}
          {errored ? (
            <form action={retryItemAction}>
              <input type="hidden" name="id" value={id} />
              <DropdownMenuItem render={<button type="submit" className="w-full" />}>
                <RotateCw />
                Retry upload
              </DropdownMenuItem>
            </form>
          ) : null}
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <form action={renameAction}>
            <DialogHeader>
              <DialogTitle>Rename</DialogTitle>
            </DialogHeader>
            <input type="hidden" name="id" value={id} />
            <Input name="name" defaultValue={name} className="my-4" autoComplete="off" aria-invalid={!!renameState.fieldErrors?.name} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>This also removes it from Google Drive. Folders take their contents with them.</AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteItemAction}>
            <input type="hidden" name="id" value={id} />
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <SubmitButton variant="destructive" pendingLabel="Deleting…">
                Delete
              </SubmitButton>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
