"use client";

import { useActionState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { createTaskAction } from "./actions";

export function TaskForm({ users }: { users: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(createTaskAction, emptyState);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <Field label="Task" name="title" error={state.fieldErrors?.title} required />
      <div className="grid gap-1.5">
        <Label htmlFor="assigneeId">Assignee</Label>
        <select
          id="assigneeId"
          name="assigneeId"
          defaultValue=""
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      {state.error ? <p className="text-sm text-destructive sm:col-span-3">{state.error}</p> : null}
    </form>
  );
}
