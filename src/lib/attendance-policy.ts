// The conflict policy quoted in every event email: a free-text contact (the
// director) plus a portal drum major to CC. Kept separate from event-comms so
// the app layout can check it cheaply on every request.
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { isLeadership } from "@/lib/roles";
import { DEFAULT_CONTACT_NAME, type ConflictPolicy } from "@/lib/event-emails";

export type CcUser = { id: string; name: string; email: string };

// The CC'd drum major, or null if none is set, they were deleted (FK nulls the
// setting) or they no longer hold a leadership role.
export async function getAbsenceCcUser(): Promise<CcUser | null> {
  const settings = await getAppSettings();
  if (!settings?.absenceCcUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: settings.absenceCcUserId },
    select: { id: true, name: true, email: true, role: true },
  });
  return user && isLeadership(user.role) ? { id: user.id, name: user.name, email: user.email } : null;
}

export async function getConflictPolicy(): Promise<ConflictPolicy> {
  const [settings, cc] = await Promise.all([getAppSettings(), getAbsenceCcUser()]);
  return {
    contactName: settings?.absenceContactName?.trim() || DEFAULT_CONTACT_NAME,
    contactEmail: settings?.absenceContactEmail?.trim() || null,
    ccName: cc?.name ?? null,
    ccEmail: cc?.email ?? null,
  };
}
