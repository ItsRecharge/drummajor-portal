"use client";

import { useActionState, useState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { composeAction, uploadImageAction } from "./actions";
import { MusicPicker, type MusicOption } from "./music-picker";
import { SaveTemplateDialog } from "./save-template-dialog";

export type GroupOption = { id: string; name: string; count: number };
export type { MusicOption };
export type TemplateOption = { id: string; subject: string; bodyHtml: string; name: string };
// Existing draft being edited (all ids/HTML come from the server page).
export type ComposerInitial = {
  id: string;
  subject: string;
  bodyHtml: string;
  groupIds: string[];
  musicIds: string[];
  scheduledAt: string | null; // ISO
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Email-client-style composer: template picker, To-chips, subject, rich body
// with inline images and @music mentions, music attachments, send/schedule/draft.
export function Composer({
  groups,
  music,
  templates,
  initial,
  initialTemplateId,
}: {
  groups: GroupOption[];
  music: MusicOption[];
  templates: TemplateOption[];
  initial?: ComposerInitial;
  initialTemplateId?: string;
}) {
  const [state, formAction, pending] = useActionState(composeAction, emptyState);
  const startTpl = initialTemplateId ? templates.find((t) => t.id === initialTemplateId) : undefined;
  // Subject and body are tracked in state so templates can fill them and the
  // Save-as-template dialog can snapshot them mid-edit.
  const [subject, setSubject] = useState(initial?.subject ?? startTpl?.subject ?? "");
  const [body, setBody] = useState(initial?.bodyHtml ?? startTpl?.bodyHtml ?? "");
  const [bodyInit, setBodyInit] = useState(initial?.bodyHtml ?? startTpl?.bodyHtml ?? "");
  const [bodyKey, setBodyKey] = useState(0);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const selectedGroups = new Set(initial?.groupIds ?? []);

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.bodyHtml);
    setBodyInit(tpl.bodyHtml);
    setBodyKey((k) => k + 1); // remount the editor with the new initial HTML
  }

  async function handleImageUpload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    return uploadImageAction(fd);
  }

  return (
    // Do not add onSubmit here — SaveTemplateDialog renders a portaled <form> whose submit events bubble through the React tree, not the DOM.
    <form action={formAction} className="grid gap-5">
      {initial ? <input type="hidden" name="announcementId" value={initial.id} /> : null}

      {templates.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="template">Start from a template</Label>
          <select
            id="template"
            defaultValue={initialTemplateId ?? ""}
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

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">To</legend>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <label
              key={g.id}
              className="cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
            >
              <input
                type="checkbox"
                name="groupIds"
                value={g.id}
                defaultChecked={selectedGroups.has(g.id)}
                className="sr-only"
              />
              {g.name} ({g.count})
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Drum majors and admins always get a copy. Anyone in two groups is emailed once.
        </p>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          aria-invalid={!!state.fieldErrors?.subject}
        />
        {state.fieldErrors?.subject ? (
          <p className="text-sm text-destructive">{state.fieldErrors.subject}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label>Message</Label>
        <RichText
          key={`body-${bodyKey}`}
          name="bodyHtml"
          initialHtml={bodyInit}
          onChange={setBody}
          onImageUpload={handleImageUpload}
          mentionItems={music}
          onMentionsChange={setMentionIds}
        />
        <p className="text-xs text-muted-foreground">
          Type <kbd className="rounded border bg-muted px-1 font-mono">@</kbd> to mention a piece from the
          Library — it&apos;s attached to the email automatically.
        </p>
        {state.fieldErrors?.bodyHtml ? (
          <p className="text-sm text-destructive">{state.fieldErrors.bodyHtml}</p>
        ) : null}
      </div>

      {music.length > 0 ? (
        <div className="grid gap-1.5">
          <Label>Attach music (optional)</Label>
          <MusicPicker options={music} initialSelected={initial?.musicIds ?? []} locked={mentionIds} />
        </div>
      ) : null}

      <Field
        label="Schedule for later (optional)"
        name="scheduledAt"
        type="datetime-local"
        defaultValue={toLocalInput(initial?.scheduledAt)}
        error={state.fieldErrors?.scheduledAt}
      />

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? "Working…" : "Send now"}
        </Button>
        <Button type="submit" name="intent" value="schedule" variant="outline" disabled={pending}>
          Schedule
        </Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
          {initial ? "Save draft" : "Save as draft"}
        </Button>
        <SaveTemplateDialog subject={subject} bodyHtml={body} />
      </div>
    </form>
  );
}
