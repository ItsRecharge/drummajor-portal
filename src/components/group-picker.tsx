"use client";

import { usePathname, useRouter } from "next/navigation";

// Class-list picker for attendance screens. Navigates with ?group=<id> so the
// server re-renders the list; no local state.
export function GroupPicker({
  groups,
  value,
  label = "Class list",
}: {
  groups: { id: string; name: string }[];
  value: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => router.replace(`${pathname}?group=${encodeURIComponent(e.target.value)}`)}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
