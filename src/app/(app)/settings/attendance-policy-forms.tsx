"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import { saveAttendancePolicyAction } from "./actions";

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Done.");
    else if (state.error) toast.error(state.error);
  }, [state]);
}

export type CcOption = { id: string; name: string; email: string };

// Who students email about a conflict: a free-text contact (the director) and
// a drum major from the portal to CC. Quoted in every event reminder and
// absence notice; the names become mailto links once addresses exist.
export function AttendancePolicySettings({
  contactName,
  contactEmail,
  ccUserId,
  leaders,
  checkInEnabled,
  checkInRadiusM,
}: {
  contactName: string;
  contactEmail: string;
  ccUserId: string;
  leaders: CcOption[];
  checkInEnabled: boolean;
  checkInRadiusM: number;
}) {
  const [state, action] = useActionState(saveAttendancePolicyAction, emptyState);
  useToast(state);
  const cc = leaders.find((l) => l.id === ccUserId);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Conflict contact" name="absenceContactName" defaultValue={contactName} error={state.fieldErrors?.absenceContactName} required />
        <Field
          label="Conflict contact email"
          name="absenceContactEmail"
          type="email"
          defaultValue={contactEmail}
          placeholder="director@winchesterps.org"
          error={state.fieldErrors?.absenceContactEmail}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="absenceCcUserId">Drum major to CC</Label>
        <select
          id="absenceCcUserId"
          name="absenceCcUserId"
          defaultValue={ccUserId}
          className="h-9 rounded-md border bg-transparent px-3 text-sm sm:max-w-sm"
          aria-invalid={!!state.fieldErrors?.absenceCcUserId}
        >
          <option value="">— nobody yet —</option>
          {leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.email})
            </option>
          ))}
        </select>
        {state.fieldErrors?.absenceCcUserId ? (
          <p className="text-sm text-destructive">{state.fieldErrors.absenceCcUserId}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Must be a portal member. If they&apos;re removed or lose their role, the next leader to sign in is asked to
          pick someone new.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Every event email and absence notice says: &ldquo;Attendance is mandatory and may impact your grade. If you
        cannot make it, email <strong>{contactName}</strong>
        {cc ? (
          <>
            {" "}
            and CC <strong>{cc.name}</strong>
          </>
        ) : null}
        . Unless it is a genuine emergency, every conflict must be cleared at least 3 days ahead of time or a cut
        will be recorded.&rdquo;
      </p>
      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">QR check-in (beta)</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="checkInEnabled"
            defaultChecked={checkInEnabled}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            Let students check themselves in by scanning a QR code on the day of the event. A drum major opens
            check-in from the sheet; the code changes every 20 seconds.
          </span>
        </label>
        <div className="sm:max-w-xs">
          <Field
            label="Allowed distance from the drum major's phone (metres)"
            name="checkInRadiusM"
            type="number"
            defaultValue={checkInRadiusM}
            error={state.fieldErrors?.checkInRadiusM}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Phones reporting worse than ±200 m accuracy are told to turn on precise location. Duplicate names, new
          phones, edge-of-radius and late scans are flagged on the sheet for you to review.
        </p>
      </fieldset>
      <div>
        <SubmitButton pendingLabel="Saving…">
          <Save data-icon="inline-start" />
          Save attendance policy
        </SubmitButton>
      </div>
    </form>
  );
}
