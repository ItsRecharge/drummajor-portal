"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { emptyState, type ActionState } from "@/lib/form";
import { decideAppealAction } from "./actions";

export type AppealRow = {
  id: string;
  student: string;
  event: string;
  when: string;
  reason: string;
  submittedAt: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  decidedBy: string | null;
};

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Done.");
    else if (state.error) toast.error(state.error);
  }, [state]);
}

function PendingAppeal({ appeal }: { appeal: AppealRow }) {
  const [state, action] = useActionState(decideAppealAction, emptyState);
  useToast(state);
  return (
    <li className="grid gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-medium">
          {appeal.student} <span className="font-normal text-muted-foreground">· {appeal.event}, {appeal.when}</span>
        </p>
        <span className="text-xs text-muted-foreground">Sent {appeal.submittedAt}</span>
      </div>
      <blockquote className="border-l-2 border-primary/60 pl-3 text-sm whitespace-pre-wrap">{appeal.reason}</blockquote>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="appealId" value={appeal.id} />
          <input type="hidden" name="decision" value="APPROVED" />
          <SubmitButton pendingLabel="Saving…" className="gap-1">
            <Check /> Excuse it
          </SubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="appealId" value={appeal.id} />
          <input type="hidden" name="decision" value="DENIED" />
          <SubmitButton variant="outline" pendingLabel="Saving…" className="gap-1">
            <X /> Deny
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

export function AppealsCard({ pending, decided }: { pending: AppealRow[]; decided: AppealRow[] }) {
  return (
    <div className="grid gap-4">
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appeals waiting.</p>
      ) : (
        <ul className="divide-y">
          {pending.map((a) => (
            <PendingAppeal key={a.id} appeal={a} />
          ))}
        </ul>
      )}
      {decided.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {decided.length} decided appeal{decided.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 divide-y text-sm">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {a.student} <span className="text-muted-foreground">· {a.event}, {a.when}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {a.decidedBy ? `by ${a.decidedBy}` : null}
                  <Badge variant={a.status === "APPROVED" ? "secondary" : "outline"}>
                    {a.status === "APPROVED" ? "Excused" : "Denied"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
