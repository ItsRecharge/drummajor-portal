"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PART_ORDER, partFileName, type MusicCategory } from "@/lib/music-naming";

// Chip multi-select of the parts a PDF contains, in concert order, with a live
// preview of the file name the portal will give it. Posts one hidden input per
// selected part under `name`.
export function PartsPicker({
  name,
  category,
  title,
  initial = [],
  compact = false,
}: {
  name: string;
  category: MusicCategory;
  title: string;
  initial?: string[];
  compact?: boolean;
}) {
  const order = PART_ORDER[category];
  const [selected, setSelected] = useState<string[]>(() => initial.filter((p) => order.includes(p)));

  function toggle(part: string) {
    setSelected((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  }

  let preview = "";
  try {
    preview = selected.length ? partFileName(title || "Title", selected, category) : "";
  } catch {
    preview = "";
  }

  return (
    <div className="grid gap-2">
      <div className={cn("flex flex-wrap gap-1", compact ? "gap-1" : "gap-1.5")}>
        {order.map((part) => {
          const on = selected.includes(part);
          return (
            <button
              key={part}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(part)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {part}
            </button>
          );
        })}
      </div>
      {selected.map((p) => (
        <input key={p} type="hidden" name={name} value={p} />
      ))}
      <p className="font-mono text-xs text-muted-foreground">
        {preview ? (
          <>
            Saved as <span className="text-foreground">{preview}</span>
          </>
        ) : (
          "Pick the parts this file contains"
        )}
      </p>
    </div>
  );
}
