"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  FolderOpen,
  CalendarDays,
  CalendarCheck,
  ClipboardCheck,
  ListChecks,
  Lightbulb,
  Flag,
  BookOpen,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; show: boolean };
type NavSection = { label?: string; items: NavItem[] };

export function AppSidebar({
  canInvite,
  canMusic,
}: {
  canInvite: boolean;
  canMusic: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Daily-use destinations, grouped. Niche/admin items live in the user menu.
  const sections: NavSection[] = [
    { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true }] },
    {
      label: "Band",
      items: [
        { href: "/announcements", label: "Email Announcements", icon: Megaphone, show: canInvite },
        { href: "/events", label: "Band Events", icon: CalendarDays, show: canInvite },
        { href: "/attendance", label: "Attendance", icon: ClipboardCheck, show: canInvite },
      ],
    },
    {
      label: "Leadership",
      items: [
        { href: "/dm-events", label: "Drum Major Events", icon: CalendarCheck, show: canInvite },
        { href: "/tasks", label: "Tasks", icon: ListChecks, show: canInvite },
        { href: "/notes", label: "Ideas", icon: Lightbulb, show: canInvite },
      ],
    },
    {
      label: "Music",
      items: [{ href: "/library", label: "Library", icon: FolderOpen, show: canMusic }],
    },
  ]
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
    .filter((s) => s.items.length > 0);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const link = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-md py-2 pr-3 pl-4 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        {/* Red yard-line tick on the active item. */}
        <span
          className={cn(
            "absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full bg-sidebar-primary transition-opacity",
            active ? "opacity-100" : "opacity-0",
          )}
        />
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 px-3">
      {sections.map((s, i) => (
        <div key={s.label ?? i} className="flex flex-col gap-0.5">
          {s.label ? <p className="eyebrow-sidebar mb-1 px-4">{s.label}</p> : null}
          {s.items.map(link)}
        </div>
      ))}
      <div className="mt-auto border-t border-sidebar-border pt-3 pb-4">
        {link({ href: "/guide", label: "Quick start guide", icon: BookOpen, show: true })}
      </div>
    </nav>
  );

  const brand = (
    <Link
      href="/dashboard"
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 px-5 py-5 text-sidebar-foreground"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
        <Flag className="size-4" />
      </span>
      <span className="font-[family-name:var(--font-display)] leading-none tracking-wide uppercase">
        <span className="block text-sm font-bold">Drum Major</span>
        <span className="block text-xs font-semibold text-sidebar-foreground/60">Portal</span>
      </span>
    </Link>
  );

  return (
    <>
      {/* Mobile menu toggle */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 left-3 z-30 grid size-9 place-items-center rounded-md border border-border bg-card text-foreground md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="field-grid hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {brand}
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-xs"
          />
          <aside className="field-grid absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
