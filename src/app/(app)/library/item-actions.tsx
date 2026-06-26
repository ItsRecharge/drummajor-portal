"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2, ExternalLink } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameItemAction, deleteItemAction } from "./actions";

export function ItemActions({
  id,
  name,
  synced,
}: {
  id: string;
  name: string;
  synced: boolean;
}) {
  const [renameOpen, setRenameOpen] = useState(false);

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
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form
            action={deleteItemAction}
            onSubmit={(e) => {
              if (!confirm(`Delete "${name}"? This also removes it from Google Drive.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={id} />
            <DropdownMenuItem
              variant="destructive"
              render={<button type="submit" className="w-full" />}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <form action={renameItemAction} onSubmit={() => setRenameOpen(false)}>
            <DialogHeader>
              <DialogTitle>Rename</DialogTitle>
            </DialogHeader>
            <input type="hidden" name="id" value={id} />
            <Input name="name" defaultValue={name} className="my-4" autoComplete="off" />
            <DialogFooter>
              <DialogClose
                render={<Button type="button" variant="outline" />}
              >
                Cancel
              </DialogClose>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
