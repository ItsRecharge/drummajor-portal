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

// Email-client-style composer: template picker, To-chips, subject, rich body
// with inline images, music attachments, and send/schedule/draft actions.
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
  // Subject and body are tracked in state so templates can fill them and the
  // Save-as-template dialog can snapshot them mid-edit.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyInit, setBodyInit] = useState("");
  const [bodyKey, setBodyKey] = useState(0);

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

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">To</legend>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <label
              key={g.id}
              className="cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input type="checkbox" name="groupIds" value={g.id} className="sr-only" />
              {g.name} ({g.count})
            </label>
          ))}
        </div>
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
          defaultValue={bodyInit}
          onChange={setBody}
          onImageUpload={handleImageUpload}
        />
        {state.fieldErrors?.bodyHtml ? (
          <p className="text-sm text-destructive">{state.fieldErrors.bodyHtml}</p>
        ) : null}
      </div>

      {music.length > 0 ? (
        <div className="grid gap-1.5">
          <Label>Attach music (optional)</Label>
          <MusicPicker options={music} />
        </div>
      ) : null}

      <Field
        label="Schedule for later (optional)"
        name="scheduledAt"
        type="datetime-local"
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
          Save draft
        </Button>
        <SaveTemplateDialog subject={subject} bodyHtml={body} />
      </div>
    </form>
  );
}
