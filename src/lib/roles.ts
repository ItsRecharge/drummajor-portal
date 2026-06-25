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
