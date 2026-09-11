"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
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
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { emptyState, type ActionState } from "@/lib/form";
import { ContactForm, type EditableContact, type SelectableGroup } from "./contact-form";
import {
  clearGroupAction,
  clearRosterAction,
  createGroupAction,
  deleteContactAction,
  deleteGroupAction,
} from "./actions";

export type GroupRow = { id: string; name: string; builtIn: boolean; count: number };
export type ContactRow = EditableContact;

function Result({ state }: { state: ActionState }) {
  if (state.success) return <p className="text-sm text-success">{state.message}</p>;
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  return null;
}

function DeleteContactForm({ contactId }: { contactId: string }) {
  const [state, action] = useActionState(deleteContactAction, emptyState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <p className="text-sm text-muted-foreground">Remove this contact from the roster.</p>
      <Result state={state} />
      <div>
        <SubmitButton variant="destructive" pendingLabel="Deleting…">
          Delete contact
        </SubmitButton>
      </div>
    </form>
  );
}

function ManageContactDialog({
  contact,
  groups,
}: {
  contact: ContactRow;
  groups: SelectableGroup[];
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Manage</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact.name}</DialogTitle>
          <DialogDescription>{contact.email}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          <ContactForm groups={groups} contact={contact} />
          <hr />
          <DeleteContactForm contactId={contact.id} />
        </div>
        <DialogClose render={<Button variant="ghost" size="sm" className="mt-2" />}>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function AddContactDialog({ groups }: { groups: SelectableGroup[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add contact</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Add a person to the roster.</DialogDescription>
        </DialogHeader>
        <ContactForm groups={groups} />
        <DialogClose render={<Button variant="ghost" size="sm" className="mt-2" />}>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function AddGroupForm() {
  const [state, action] = useActionState(createGroupAction, emptyState);
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="flex-1">
        <Field label="New group" name="name" error={state.fieldErrors?.name} required />
      </div>
      <SubmitButton pendingLabel="Creating…">Create</SubmitButton>
    </form>
  );
}

function DeleteGroupButton({ groupId }: { groupId: string }) {
  const [, action] = useActionState(deleteGroupAction, emptyState);
  return (
    <form action={action}>
      <input type="hidden" name="groupId" value={groupId} />
      <SubmitButton variant="ghost" pendingLabel="…" className="h-7 px-2 text-destructive">
        Delete
      </SubmitButton>
    </form>
  );
}

// Toast + close an AlertDialog when its action reports back.
function useActionToast(state: ActionState, onDone: () => void) {
  useEffect(() => {
    if (state.success) {
      toast.success(state.message ?? "Done.");
      onDone();
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function ClearGroupDialog({ group }: { group: GroupRow }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(clearGroupAction, emptyState);
  useActionToast(state, () => setOpen(false));
  if (group.count === 0) return null;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2" />}>
        Remove all members
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Empty “{group.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes all {group.count} member{group.count === 1 ? "" : "s"} from this group. The contacts
            themselves stay in the roster. Sent announcements are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          <input type="hidden" name="groupId" value={group.id} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton variant="destructive" pendingLabel="Removing…">
              Remove {group.count}
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ClearRosterDialog({ totalContacts }: { totalContacts: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action] = useActionState(clearRosterAction, emptyState);
  useActionToast(state, () => {
    setOpen(false);
    setTyped("");
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={totalContacts === 0} />}>
        Clear entire roster
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the whole roster?</AlertDialogTitle>
          <AlertDialogDescription>
            Deletes all {totalContacts} contact{totalContacts === 1 ? "" : "s"} and their group memberships —
            do this once a year before importing the new rosters. Sent announcements and their open
            counts are kept. Drum majors keep their accounts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-clear">
              Type <span className="font-mono font-semibold">CLEAR</span> to confirm
            </Label>
            <Input
              id="confirm-clear"
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              aria-invalid={!!state.fieldErrors?.confirm}
            />
            {state.fieldErrors?.confirm ? (
              <p className="text-sm text-destructive">{state.fieldErrors.confirm}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={typed.trim() !== "CLEAR"}>
              Delete {totalContacts} contact{totalContacts === 1 ? "" : "s"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GroupsManager({ groups, totalContacts }: { groups: GroupRow[]; totalContacts: number }) {
  return (
    <div className="grid gap-4">
      <AddGroupForm />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.id}>
              <TableCell>
                {g.name}
                {g.builtIn ? <Badge variant="outline" className="ml-2">Built-in</Badge> : null}
              </TableCell>
              <TableCell>{g.count}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {g.name === "Everyone" ? null : <ClearGroupDialog group={g} />}
                  {g.builtIn ? null : <DeleteGroupButton groupId={g.id} />}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
        <p className="text-sm text-muted-foreground">
          New school year? Clear everything, then import this year&apos;s rosters.
        </p>
        <ClearRosterDialog totalContacts={totalContacts} />
      </div>
    </div>
  );
}

export function ContactsManager({
  contacts,
  groups,
  leadershipEmails,
}: {
  contacts: ContactRow[];
  // All groups (for the filter, includes built-ins) and selectable groups (forms).
  groups: GroupRow[];
  // Portal users (drum majors / admins) — flagged so nobody wonders about double emails.
  leadershipEmails: string[];
}) {
  const [filter, setFilter] = useState<string>("");
  const selectable: SelectableGroup[] = groups
    .filter((g) => g.name !== "Everyone")
    .map((g) => ({ id: g.id, name: g.name }));
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const leaders = useMemo(() => new Set(leadershipEmails.map((e) => e.toLowerCase())), [leadershipEmails]);

  const visible = useMemo(
    () => (filter ? contacts.filter((c) => c.groupIds.includes(filter)) : contacts),
    [contacts, filter],
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs"
        >
          <option value="">All contacts ({contacts.length})</option>
          {selectable.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <AddContactDialog groups={selectable} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Instrument</TableHead>
            <TableHead>Groups</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {c.name}
                {leaders.has(c.email.toLowerCase()) ? (
                  <Badge variant="outline" className="ml-2">
                    Drum major
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{c.email}</TableCell>
              <TableCell>{c.instrument || "—"}</TableCell>
              <TableCell>
                {c.groupIds.length === 0
                  ? "—"
                  : c.groupIds.map((id) => groupNames.get(id) ?? "?").join(", ")}
              </TableCell>
              <TableCell className="text-right">
                <ManageContactDialog contact={c} groups={selectable} />
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-center">
                No contacts yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
