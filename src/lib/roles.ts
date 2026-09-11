import { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: "Admin",
  [Role.DRUM_MAJOR]: "Drum Major",
  [Role.LIBRARIAN]: "Librarian",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

// Roles a given inviter/editor is allowed to assign. Only admins may assign ADMIN.
export function assignableRoles(actorRole: Role): Role[] {
  if (actorRole === Role.ADMIN) return [Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN];
  return [Role.DRUM_MAJOR, Role.LIBRARIAN];
}

// "Leadership" = the people who run the band day to day: drum majors plus admins
// (head drum major / directors). They get every announcement, task, idea and
// drum-major event. Librarians only touch the music library.
export const LEADERSHIP_ROLES: readonly Role[] = [Role.ADMIN, Role.DRUM_MAJOR];

export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

export function isLeadership(role: Role): boolean {
  return LEADERSHIP_ROLES.includes(role);
}

export function canManageMusic(role: Role): boolean {
  return isLeadership(role) || role === Role.LIBRARIAN;
}
