"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { RoleSelect } from "@/components/role-select";
import { Label } from "@/components/ui/label";
import { emptyState } from "@/lib/form";
import type { Role } from "@/generated/prisma/enums";
import { createInviteAction } from "./actions";

export function InviteForm({ roles }: { roles: Role[] }) {
  const [state, action] = useActionState(createInviteAction, emptyState);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Email" name="email" type="email" error={state.fieldErrors?.email} required />
      <div className="grid gap-1.5">
        <Label htmlFor="role">Role</Label>
        <RoleSelect name="role" roles={roles} />
        {state.fieldErrors?.role ? (
          <p className="text-sm text-destructive">{state.fieldErrors.role}</p>
        ) : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-green-600">{state.message}</p> : null}
      <div>
        <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
      </div>
    </form>
  );
}
