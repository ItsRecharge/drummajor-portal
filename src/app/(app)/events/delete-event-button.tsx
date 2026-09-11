"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteEventAction } from "./actions";

export function DeleteEventButton({ id, title }: { id: string; title: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Delete ${title}`} />}>
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes it from the portal. Emails or calendar invites already sent are not recalled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteEventAction}>
          <input type="hidden" name="eventId" value={id} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Delete event
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
