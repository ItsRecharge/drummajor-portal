"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  FolderOpen,
  CalendarDays,
  ListChecks,
  Lightbulb,
  Flag,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; show: boolean };

export function AppSidebar({
  canInvite,
  canMusic,
}: {
  canInvite: boolean;
  canMusic: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Main daily-use destinations only. Niche/admin items live in the user menu.
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { href: "/announcements", label: "Email Announcements", icon: Megaphone, show: canInvite },
    { href: "/library", label: "Library", icon: FolderOpen, show: canMusic },
    { href: "/events", label: "Events", icon: CalendarDays, show: canInvite },
    { href: "/tasks", label: "Tasks", icon: ListChecks, show: canInvite },
    { href: "/notes", label: "Ideas", icon: Lightbulb, show: canInvite },
    { href: "/handoff", label: "Handoff", icon: Flag, show: canInvite },
  ].filter((i) => i.show);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-3">
      {items.map(({ href, label, icon: Icon }) => {
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
                ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            {/* Brass yard-line tick on the active item. */}
            <span
              className={cn(
                "absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full bg-primary transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link
      href="/dashboard"
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 px-5 py-5"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
        <Flag className="size-4" />
      </span>
      <span className="font-[family-name:var(--font-display)] leading-none tracking-wide uppercase">
        <span className="block text-sm font-bold">Drum Major</span>
        <span className="block text-xs font-semibold text-muted-foreground">Portal</span>
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
      <aside className="field-grid hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        {brand}
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-xs"
          />
          <aside className="field-grid absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
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
