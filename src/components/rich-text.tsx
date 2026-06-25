"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Lightweight rich-text editor: a contenteditable surface with a small toolbar,
// syncing its HTML into a hidden input so it posts with the surrounding form.
// Output is sanitized server-side (src/lib/sanitize.ts) before storage/send.
export function RichText({
  name,
  defaultValue = "",
  onChange,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue);

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
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        className="min-h-40 rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
