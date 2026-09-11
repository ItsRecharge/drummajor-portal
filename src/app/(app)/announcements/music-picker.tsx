"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X, AtSign } from "lucide-react";

export type MusicOption = { id: string; title: string; subtitle?: string };

// Searchable multi-select for attaching Library pieces to an announcement.
// Selected pieces render as chips carrying hidden musicIds inputs. Ids in
// `locked` come from @mentions in the message: they're unioned in at render,
// shown as chips, and not removable here (delete the mention in the text).
export function MusicPicker({
  options,
  initialSelected = [],
  locked = [],
}: {
  options: MusicOption[];
  initialSelected?: string[];
  locked?: string[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const byId = new Map(options.map((o) => [o.id, o]));
  const lockedSet = new Set(locked);
  const all = [...new Set([...selected, ...locked])].filter((id) => byId.has(id));

  const q = query.trim().toLowerCase();
  const matches = q
    ? options
        .filter(
          (o) =>
            !all.includes(o.id) &&
            (o.title.toLowerCase().includes(q) || (o.subtitle ?? "").toLowerCase().includes(q)),
        )
        .slice(0, 8)
    : [];

  function add(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  }

  return (
    <div className="grid gap-2">
      {all.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {all.map((id) => {
            const o = byId.get(id)!;
            const isLocked = lockedSet.has(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm"
                title={o.subtitle}
              >
                {isLocked ? <AtSign className="size-3.5 text-primary" aria-label="Mentioned in message" /> : null}
                {o.title}
                {isLocked ? (
                  <span className="text-xs text-muted-foreground">mentioned</span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remove ${o.title}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected((prev) => prev.filter((p) => p !== id))}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                <input type="hidden" name="musicIds" value={id} />
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) add(matches[0].id);
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
                  onClick={() => add(m.id)}
                >
                  <span className="block truncate">{m.title}</span>
                  {m.subtitle ? <span className="block truncate text-xs text-muted-foreground">{m.subtitle}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
