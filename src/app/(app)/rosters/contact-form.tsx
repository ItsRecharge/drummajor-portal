"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { emptyState, type ActionState } from "@/lib/form";
import { createContactAction, editContactAction } from "./actions";

export type SelectableGroup = { id: string; name: string };
export type EditableContact = {
  id: string;
  name: string;
  email: string;
  instrument: string;
  grade?: number;
  groupIds: string[];
};

function Result({ state }: { state: ActionState }) {
  if (state.success) return <p className="text-sm text-success">{state.message}</p>;
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  return null;
}

export function ContactForm({
  groups,
  contact,
}: {
  groups: SelectableGroup[];
  contact?: EditableContact;
}) {
  const [state, action] = useActionState(
    contact ? editContactAction : createContactAction,
    emptyState,
  );
  const selected = new Set(contact?.groupIds ?? []);

  return (
    <form action={action} className="grid gap-3">
      {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}
      <Field label="Name" name="name" defaultValue={contact?.name} error={state.fieldErrors?.name} required />
      <Field
        label="Email"
        name="email"
        type="email"
        defaultValue={contact?.email}
        error={state.fieldErrors?.email}
        required
      />
      <Field label="Instrument" name="instrument" defaultValue={contact?.instrument} error={state.fieldErrors?.instrument} />
      <Field label="Grade" name="grade" type="number" defaultValue={contact?.grade} error={state.fieldErrors?.grade} />
      {groups.length > 0 ? (
        <div className="grid gap-1.5">
          <Label>Groups</Label>
          <div className="grid gap-1.5">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="groupIds"
                  value={g.id}
                  defaultChecked={selected.has(g.id)}
                  className="h-4 w-4"
                />
                {g.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <Result state={state} />
      <div>
        <SubmitButton pendingLabel="Saving…">{contact ? "Save changes" : "Add contact"}</SubmitButton>
      </div>
    </form>
  );
}
