"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { emptyState } from "@/lib/form";
import { assignAbsenceCcAction } from "@/app/(app)/actions";

// Shown to leadership on every page until a drum major is set to be CC'd on
// conflicts — on first setup, and again if that person is removed or demoted.
// Always mounted (renders nothing once assigned) so the action's toast still
// fires after the layout re-renders without the banner.
export function CcAssignmentBanner({
  missing,
  leaders,
  contactName,
}: {
  missing: boolean;
  leaders: { id: string; name: string }[];
  contactName: string;
}) {
  const [state, action] = useActionState(assignAbsenceCcAction, emptyState);
  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Saved.");
    else if (state.error) toast.error(state.error);
  }, [state]);
  if (!missing) return null;

  return (
    <div
      role="region"
      aria-label="Choose the drum major to CC on conflicts"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/40 bg-primary/10 px-4 py-2 pl-16 text-sm md:pl-4"
    >
      <span>
        <strong>Who should students CC on conflicts?</strong> Event emails tell students to email {contactName} and
        CC a drum major, but nobody is set.
      </span>
      <form action={action} className="flex items-center gap-2">
        <select
          name="absenceCcUserId"
          aria-label="Drum major to CC"
          required
          defaultValue=""
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Pick a drum major…
          </option>
          {leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </form>
    </div>
  );
}
