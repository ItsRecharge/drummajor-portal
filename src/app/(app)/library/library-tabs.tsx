import Link from "next/link";
import { Search, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// Two views of the same Drive folder: the searchable music catalog, and the
// raw folder browser.
export function LibraryTabs({ active }: { active: "search" | "folders" }) {
  const tab = (key: "search" | "folders", href: string, label: string, Icon: typeof Search) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active === key
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
  return (
    <div className="flex items-end gap-1 border-b border-border">
      {tab("search", "/library", "Music search", Search)}
      {tab("folders", "/library/folders", "Library folders", FolderOpen)}
    </div>
  );
}
