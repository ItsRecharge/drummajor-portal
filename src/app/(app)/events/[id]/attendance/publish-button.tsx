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
  disabledReason,
}: {
  eventId: string;
  absent: number;
  present: number;
  disabledReason: string | null;
}) {
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
            <AlertDialogDescription>
              {`This emails the ${absent} student${absent === 1 ? "" : "s"} marked absent right away, each with a personal appeal link. Once published, anyone you mark absent later is emailed within a minute. This can't be undone.`}
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
