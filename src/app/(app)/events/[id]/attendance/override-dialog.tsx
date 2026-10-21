"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { SheetSnapshot } from "@/lib/attendance";
import { overrideAttendanceAction, type OverrideChange } from "./actions";

// Saving changes to a published sheet: one password prompt per override, sent
// together with the changes.
export function OverrideDialog({
  eventId,
  changes,
  onSaved,
}: {
  eventId: string;
  changes: OverrideChange[];
  onSaved: (snapshot: SheetSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const n = changes.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await overrideAttendanceAction(eventId, changes, password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(res.message ?? "Saved.");
      setOpen(false);
      setPassword("");
      setError(null);
      onSaved(res.snapshot);
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPassword("");
          setError(null);
        }
      }}
    >
      <AlertDialogTrigger render={<Button size="sm" disabled={n === 0} />}>Save override</AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Override published attendance?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Enter your password to change ${n} student${n === 1 ? "" : "s"} on a published sheet. Your name is recorded in the audit log, and each student whose status changes is emailed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="override-password">Your password</Label>
            <Input
              id="override-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={pending || password.length === 0}>
              {pending ? "Saving…" : "Save and email"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
