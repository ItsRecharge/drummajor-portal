"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { RoleSelect } from "@/components/role-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { emptyState, type ActionState } from "@/lib/form";
import { roleLabel } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";
import {
  editUserAction,
  godModeCredsAction,
  transferAdminAction,
  impersonateAction,
} from "./actions";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  verified: boolean;
};

function Result({ state }: { state: ActionState }) {
  if (state.success) return <p className="text-sm text-green-600">{state.message}</p>;
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  return null;
}

function EditForm({ member, roles }: { member: Member; roles: Role[] }) {
  const [state, action] = useActionState(editUserAction, emptyState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="userId" value={member.id} />
      <Field label="Name" name="name" defaultValue={member.name} error={state.fieldErrors?.name} required />
      <Field label="Email" name="email" type="email" defaultValue={member.email} error={state.fieldErrors?.email} required />
      <div className="grid gap-1.5">
        <Label htmlFor={`role-${member.id}`}>Role</Label>
        <RoleSelect id={`role-${member.id}`} name="role" roles={roles} defaultValue={member.role} />
      </div>
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}

function GodModeForm({ member }: { member: Member }) {
  const [state, action] = useActionState(godModeCredsAction, emptyState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="userId" value={member.id} />
      <p className="text-sm text-muted-foreground">
        Directly override credentials (no current-password required). Logged to the audit log.
      </p>
      <Field label="New email" name="newEmail" type="email" error={state.fieldErrors?.newEmail} />
      <Field label="New password" name="newPassword" type="password" error={state.fieldErrors?.newPassword} />
      <Result state={state} />
      <div>
        <SubmitButton variant="destructive" pendingLabel="Applying…">
          Override credentials
        </SubmitButton>
      </div>
    </form>
  );
}

function ManageDialog({
  member,
  roles,
  isSelf,
}: {
  member: Member;
  roles: Role[];
  isSelf: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Manage</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member.name}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <EditForm member={member} roles={roles} />
          <hr />
          <GodModeForm member={member} />

          {!isSelf ? (
            <>
              <hr />
              <div className="flex flex-wrap gap-3">
                <form action={impersonateAction}>
                  <input type="hidden" name="userId" value={member.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Impersonate
                  </Button>
                </form>
                {member.role !== Role.ADMIN ? (
                  <form action={transferAdminAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Transfer admin to this user
                    </Button>
                  </form>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <DialogClose render={<Button variant="ghost" size="sm" className="mt-2" />}>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function UsersManager({
  members,
  currentUserId,
  roles,
}: {
  members: Member[];
  currentUserId: string;
  roles: Role[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{m.name}</TableCell>
            <TableCell>
              {m.email}
              {!m.verified ? <Badge variant="outline" className="ml-2">Unverified</Badge> : null}
            </TableCell>
            <TableCell>{roleLabel(m.role)}</TableCell>
            <TableCell className="text-right">
              <ManageDialog member={m} roles={roles} isSelf={m.id === currentUserId} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
