"use client";

import { useActionState, useState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { composeAction } from "./actions";

export type GroupOption = { id: string; name: string; count: number };
export type MusicOption = { id: string; title: string };
export type TemplateOption = { id: string; subject: string; bodyHtml: string; name: string };

export function Composer({
  groups,
  music,
  templates,
}: {
  groups: GroupOption[];
  music: MusicOption[];
  templates: TemplateOption[];
}) {
  const [state, formAction, pending] = useActionState(composeAction, emptyState);
  const [subject, setSubject] = useState("");
  const [bodyInit, setBodyInit] = useState("");
  const [bodyKey, setBodyKey] = useState(0);

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBodyInit(tpl.bodyHtml);
    setBodyKey((k) => k + 1);
  }

  return (
    <form action={formAction} className="grid gap-5">
      {templates.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="template">Start from a template</Label>
          <select
            id="template"
            defaultValue=""
            onChange={(e) => applyTemplate(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">— None —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Field
        label="Subject"
        name="subject"
        error={state.fieldErrors?.subject}
        defaultValue={subject}
        key={`subject-${bodyKey}`}
        required
      />

      <div className="grid gap-1.5">
        <Label>Message</Label>
        <RichText key={`body-${bodyKey}`} name="bodyHtml" defaultValue={bodyInit} />
        {state.fieldErrors?.bodyHtml ? (
          <p className="text-sm text-destructive">{state.fieldErrors.bodyHtml}</p>
        ) : null}
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Recipients</legend>
        {groups.map((g) => (
          <label key={g.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="groupIds" value={g.id} />
            {g.name} <span className="text-muted-foreground">({g.count})</span>
          </label>
        ))}
      </fieldset>

      {music.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Attach music (optional)</legend>
          {music.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="musicIds" value={m.id} />
              {m.title}
            </label>
          ))}
        </fieldset>
      ) : null}

      <Field
        label="Schedule for later (optional)"
        name="scheduledAt"
        type="datetime-local"
        error={state.fieldErrors?.scheduledAt}
      />

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? "Working…" : "Send now"}
        </Button>
        <Button type="submit" name="intent" value="schedule" variant="outline" disabled={pending}>
          Schedule
        </Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
          Save draft
        </Button>
      </div>
    </form>
  );
}
