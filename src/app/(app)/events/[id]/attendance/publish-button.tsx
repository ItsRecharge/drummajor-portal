"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { publishAttendanceAction } from "./actions";

// The one step that emails students. Every drum major confirms it in a dialog;
// the sheet itself already saved on every tap.
export function PublishButton({
  eventId,
  absent,
  present,
  unmarked,
  others,
  disabledReason,
}: {
  eventId: string;
  absent: number;
  present: number;
  // Students nobody has marked; publishing makes them Absent.
  unmarked: number;
  // Other drum majors with the sheet open right now.
  others: string[];
  disabledReason: string | null;
}) {
  const emailed = absent + unmarked;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const res = await publishAttendanceAction(eventId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Published.");
      setOpen(false);
    });

  return (
    <div className="flex items-center gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button size="sm" disabled={!!disabledReason} />}>
          <Send /> Publish attendance
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish attendance?</AlertDialogTitle>
            {others.length > 0 ? (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
                <strong>{others.join(", ")} {others.length === 1 ? "is" : "are"} still on this sheet.</strong> Make
                sure they&apos;re done before publishing.
              </p>
            ) : null}
            {unmarked > 0 ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
                <strong>
                  {unmarked} student{unmarked === 1 ? " isn't" : "s aren't"} marked yet.
                </strong>{" "}
                Publishing marks {unmarked === 1 ? "them" : "them all"} Absent and emails them.
              </p>
            ) : null}
            <AlertDialogDescription>
              {`This emails ${emailed} student${emailed === 1 ? "" : "s"} as absent right away, each with a personal appeal link. Once published, the sheet is locked — changes need an override with your password. This can't be undone.`}
              {present === 0 ? " Nobody is marked present yet." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Not yet</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={confirm}>
              {pending ? "Publishing…" : "Publish and email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {disabledReason ? <span className="text-xs text-muted-foreground">{disabledReason}</span> : null}
    </div>
  );
}
