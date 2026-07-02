"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Lightweight rich-text editor: a contenteditable surface with a small toolbar,
// syncing its HTML into a hidden input so it posts with the surrounding form.
// Output is sanitized server-side (src/lib/sanitize.ts) before storage/send.
// When `onImageUpload` is provided, an Image button uploads a picked file and
// embeds the returned URL at the caret.
export function RichText({
  name,
  defaultValue = "",
  onChange,
  onImageUpload,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  onImageUpload?: (file: File) => Promise<{ url?: string; error?: string }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The caret position is lost when the native file dialog steals focus, so we
  // snapshot the selection on mousedown and restore it before inserting.
  const savedRange = useRef<Range | null>(null);
  const [html, setHtml] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function sync() {
    const next = ref.current?.innerHTML ?? "";
    setHtml(next);
    onChange?.(next);
  }

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }

  function addLink() {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImageUpload) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await onImageUpload(file);
      if (res.error || !res.url) {
        setUploadError(res.error ?? "Upload failed.");
        return;
      }
      restoreSelection();
      exec("insertImage", res.url);
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const btn = "px-2 py-1 h-8";
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("bold")}>
          <b>B</b>
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("italic")}>
          <i>I</i>
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("underline")}>
          <u>U</u>
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("insertUnorderedList")}>
          • List
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("insertOrderedList")}>
          1. List
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={addLink}>
          Link
        </Button>
        {onImageUpload ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={btn}
              disabled={uploading}
              onMouseDown={saveSelection}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Image"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={pickImage}
            />
          </>
        ) : null}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        className="min-h-40 rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
