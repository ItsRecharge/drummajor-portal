"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  commitImportAction,
  previewImportAction,
  type ImportPreview,
  type ImportResult,
  type ImportRowStatus,
} from "./actions";

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  new: "New",
  duplicate: "Duplicate",
  exists: "Already exists",
  error: "Error",
};

function StatusBadge({ status }: { status: ImportRowStatus }) {
  const variant = status === "new" ? "default" : status === "error" ? "destructive" : "outline";
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export function CsvImport() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setCsv(text);
      setPreview(null);
      setResult(null);
    });
  }

  function runPreview() {
    setResult(null);
    startTransition(async () => {
      setPreview(await previewImportAction(csv));
    });
  }

  function runCommit() {
    startTransition(async () => {
      const res = await commitImportAction(csv);
      setResult(res);
      setPreview(null);
      if (res.ok) setCsv("");
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Paste CSV or upload a <code>.csv</code> file with columns{" "}
        <code>Name,Email,Instrument,Grade,Group</code>. Instrument, Grade, and Group are
        optional; group names must already exist.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
      <Textarea
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setResult(null);
        }}
        rows={6}
        placeholder="Name,Email,Instrument,Group&#10;Jane Doe,jane@example.com,Flute,Marching"
      />
      <div className="flex gap-2">
        <Button type="button" onClick={runPreview} disabled={pending || !csv.trim()}>
          {pending ? "Working…" : "Preview"}
        </Button>
        {preview?.ok && preview.counts.new > 0 ? (
          <Button type="button" variant="default" onClick={runCommit} disabled={pending}>
            Import {preview.counts.new} contact{preview.counts.new === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>

      {result ? (
        result.ok ? (
          <p className="text-sm text-success">
            Imported {result.imported}; skipped {result.skipped}; errors {result.errors}.
          </p>
        ) : (
          <p className="text-sm text-destructive">{result.error}</p>
        )
      ) : null}

      {preview && !preview.ok ? <p className="text-sm text-destructive">{preview.error}</p> : null}

      {preview?.ok ? (
        <div className="grid gap-2">
          <p className="text-sm">
            {preview.counts.new} new · {preview.counts.exists} already exist ·{" "}
            {preview.counts.duplicate} duplicate · {preview.counts.error} error
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => (
                <TableRow key={r.line}>
                  <TableCell>{r.line}</TableCell>
                  <TableCell>{r.name || "—"}</TableCell>
                  <TableCell>{r.email || "—"}</TableCell>
                  <TableCell>{r.group || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                    {r.reason ? (
                      <span className="text-muted-foreground ml-2 text-xs">{r.reason}</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
