"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export type MusicOption = { id: string; title: string };

// Searchable multi-select for attaching Library pieces to an announcement.
// Selected pieces render as removable chips; each chip carries a hidden
// musicIds input so the selection posts with the surrounding form.
export function MusicPicker({ options }: { options: MusicOption[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MusicOption[]>([]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? options
        .filter((o) => o.title.toLowerCase().includes(q) && !selected.some((s) => s.id === o.id))
        .slice(0, 8)
    : [];

  function add(option: MusicOption) {
    setSelected((prev) => [...prev, option]);
    setQuery("");
  }

  return (
    <div className="grid gap-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              {s.title}
              <button
                type="button"
                aria-label={`Remove ${s.title}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSelected((prev) => prev.filter((p) => p.id !== s.id))}
              >
                <X className="size-3.5" />
              </button>
              <input type="hidden" name="musicIds" value={s.id} />
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) add(matches[0]);
            }
          }}
          placeholder="Search the library…"
          aria-label="Search music"
        />
        {matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => add(m)}
                >
                  {m.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
