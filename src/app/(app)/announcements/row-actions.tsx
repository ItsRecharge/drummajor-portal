"use client";

import Link from "next/link";
import { Pencil, Trash2, CalendarX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { SubmitButton } from "@/components/submit-button";
import { cancelScheduledAction, deleteAnnouncementAction } from "./actions";

// Per-row controls for drafts (edit/delete) and scheduled sends (cancel).
export function DraftActions({ id, subject }: { id: string; subject: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={`/announcements/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Pencil data-icon="inline-start" />
        Edit
      </Link>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="sm" aria-label="Delete draft" />}>
          <Trash2 />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>“{subject}” will be gone for good.</AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteAnnouncementAction}>
            <input type="hidden" name="announcementId" value={id} />
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <SubmitButton variant="destructive" pendingLabel="Deleting…">
                Delete draft
              </SubmitButton>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CancelScheduledButton({ id, subject }: { id: string; subject: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarX data-icon="inline-start" />
        Cancel
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel the scheduled send?</AlertDialogTitle>
          <AlertDialogDescription>
            “{subject}” goes back to Drafts. Nothing is emailed until you send it again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={cancelScheduledAction}>
          <input type="hidden" name="announcementId" value={id} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep schedule</AlertDialogCancel>
            <SubmitButton variant="destructive" pendingLabel="Cancelling…">
              Cancel send
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
