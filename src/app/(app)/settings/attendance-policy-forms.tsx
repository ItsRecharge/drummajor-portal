"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import { saveAttendancePolicyAction } from "./actions";

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Done.");
    else if (state.error) toast.error(state.error);
  }, [state]);
}

// Who students email about a conflict. Quoted in every event reminder and
// absence notice; the names become mailto links once addresses are entered.
export function AttendancePolicySettings({
  contactName,
  contactEmail,
  ccName,
  ccEmail,
}: {
  contactName: string;
  contactEmail: string;
  ccName: string;
  ccEmail: string;
}) {
  const [state, action] = useActionState(saveAttendancePolicyAction, emptyState);
  useToast(state);

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
        <Field label="CC" name="absenceCcName" defaultValue={ccName} error={state.fieldErrors?.absenceCcName} required />
        <Field
          label="CC email"
          name="absenceCcEmail"
          type="email"
          defaultValue={ccEmail}
          placeholder="drummajor@wpsstudent.com"
          error={state.fieldErrors?.absenceCcEmail}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Every event email and absence notice says: &ldquo;Attendance is mandatory and may impact your grade. If you
        cannot make it, email <strong>{contactName}</strong> and CC <strong>{ccName}</strong>. Unless it is a genuine
        emergency, every conflict must be cleared at least 3 days ahead of time or a cut will be recorded.&rdquo;
        {contactEmail ? "" : " Add the email addresses so the names become clickable."}
      </p>
      <div>
        <SubmitButton pendingLabel="Saving…">
          <Save data-icon="inline-start" />
          Save conflict contacts
        </SubmitButton>
      </div>
    </form>
  );
}
