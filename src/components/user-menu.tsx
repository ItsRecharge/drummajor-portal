"use client";

import Link from "next/link";
import {
  Users,
  Mail,
  ShieldCheck,
  ScrollText,
  Settings,
  LogOut,
  ChevronDown,
  Flag,
  BookOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ThemeMenuItems } from "@/components/theme-toggle";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  name,
  canInvite,
  isAdmin,
  logoutAction,
}: {
  name: string;
  canInvite: boolean;
  isAdmin: boolean;
  logoutAction: () => void | Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(name)}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {canInvite ? (
          <DropdownMenuItem render={<Link href="/rosters" />}>
            <Users />
            Roster
          </DropdownMenuItem>
        ) : null}
        {canInvite ? (
          <DropdownMenuItem render={<Link href="/invites" />}>
            <Mail />
            Invites
          </DropdownMenuItem>
        ) : null}
        {canInvite ? (
          <DropdownMenuItem render={<Link href="/handoff" />}>
            <Flag />
            Handoff
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin/users" />}>
            <ShieldCheck />
            Members
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/audit" />}>
            <ScrollText />
            Logs
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/guide" />}>
          <BookOpen />
          Quick start guide
        </DropdownMenuItem>
        <ThemeMenuItems />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem
            variant="destructive"
            render={<button type="submit" className="w-full" />}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
