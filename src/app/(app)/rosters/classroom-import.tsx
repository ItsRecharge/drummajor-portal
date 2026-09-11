"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  commitClassroomImportAction,
  previewClassroomImportAction,
  type ClassroomPreview,
  type ClassroomRowStatus,
} from "./actions";

type GroupChoice = { id: string; name: string };

const STATUS: Record<ClassroomRowStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  new: { label: "New", variant: "default" },
  "in-group": { label: "Already in group", variant: "outline" },
  "add-to-group": { label: "Add to group", variant: "secondary" },
  "remove-from-group": { label: "Remove from group", variant: "destructive" },
  delete: { label: "Delete contact", variant: "destructive" },
  skipped: { label: "Skipped", variant: "outline" },
};

export function ClassroomImport({ groups }: { groups: GroupChoice[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<ClassroomPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();

  function run(kind: "preview" | "commit") {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      if (kind === "preview") {
        const res = await previewClassroomImportAction(fd);
        setPreview(res);
        if (!res.ok) toast.error(res.error ?? "Could not read that file.");
        return;
      }
      const res = await commitClassroomImportAction(fd);
      if (!res.ok) {
        toast.error(res.error ?? "Import failed.");
        return;
      }
      toast.success(
        `Imported: ${res.added} new, ${res.addedToGroup} added to group, ${res.removed} removed, ${res.deleted} deleted, ${res.skipped} skipped.`,
      );
      setPreview(null);
      form.reset();
      setFileName("");
    });
  }

  const changes =
    preview?.ok
      ? preview.counts.new + preview.counts["add-to-group"] + preview.counts["remove-from-group"] + preview.counts.delete
      : 0;

  return (
    <div className="grid gap-5">
      <ol className="grid gap-1 text-sm text-muted-foreground [&_kbd]:rounded [&_kbd]:border [&_kbd]:bg-muted [&_kbd]:px-1.5 [&_kbd]:py-0.5 [&_kbd]:font-mono [&_kbd]:text-xs [&_kbd]:text-foreground">
        <li>
          1. In Chrome, open the band Classroom → <strong>People</strong>. Reload the page there.
        </li>
        <li>
          2. Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd> → <strong>Webpage, Complete</strong>. Keep the{" "}
          <code>.html</code> file.
        </li>
        <li>3. Upload it here with the matching group. Do the same for the other class.</li>
      </ol>

      <form ref={formRef} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-1.5">
          <Label htmlFor="classroom-file">Saved People page</Label>
          <input
            id="classroom-file"
            name="file"
            type="file"
            accept=".html,.htm,text/html"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? "");
              setPreview(null);
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="classroom-group">Group</Label>
          <select
            id="classroom-group"
            name="groupId"
            className="border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs"
            onChange={() => setPreview(null)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox name="syncGroup" value="on" defaultChecked onCheckedChange={() => setPreview(null)} />
          Remove people from this group who aren&apos;t in this file (use for a new year&apos;s roster)
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="button" onClick={() => run("preview")} disabled={pending || !fileName}>
            {pending ? "Working…" : "Preview"}
          </Button>
          {preview?.ok && changes > 0 ? (
            <Button type="button" variant="default" onClick={() => run("commit")} disabled={pending}>
              Import {changes} change{changes === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
      </form>

      {preview?.ok ? (
        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p>
              <strong>Detected:</strong> {preview.className ?? "Unknown class"}
              {preview.expectedCount !== null ? ` · page says ${preview.expectedCount} students` : ""} ·{" "}
              {preview.rows.filter((r) => r.status !== "skipped" && r.status !== "remove-from-group" && r.status !== "delete").length}{" "}
              student emails found → <strong>{preview.groupName}</strong>
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="mt-1 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {w}
              </p>
            ))}
            {changes === 0 ? <p className="mt-1 text-muted-foreground">Nothing to change — this group already matches the file.</p> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {preview.counts.new} new · {preview.counts["add-to-group"]} add to group · {preview.counts["in-group"]} already in group ·{" "}
            {preview.counts["remove-from-group"]} remove · {preview.counts.delete} delete · {preview.counts.skipped} skipped
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={`${r.status}-${r.email}`}>
                    <TableCell>
                      {r.name || "—"}
                      {r.leader ? (
                        <Badge variant="outline" className="ml-2">
                          Drum major
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                      {r.reason ? <span className="ml-2 text-xs text-muted-foreground">{r.reason}</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
