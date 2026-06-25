import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// In-app notifications. `type` is a short string ("ANNOUNCEMENT", "TASK_ASSIGNED",
// "MUSIC_ADDED", "EVENT") and `payload` carries whatever the bell/list needs to
// render and link.
export async function createNotification(
  userId: string,
  type: string,
  payload: Prisma.InputJsonValue = {},
): Promise<void> {
  await prisma.notification.create({ data: { userId, type, payload } });
}

export async function notifyUsers(
  userIds: string[],
  type: string,
  payload: Prisma.InputJsonValue = {},
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, payload })),
  });
}

// Notify every user, optionally excluding the actor who triggered it.
export async function notifyAll(
  type: string,
  payload: Prisma.InputJsonValue = {},
  exceptUserId?: string,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: exceptUserId ? { id: { not: exceptUserId } } : {},
    select: { id: true },
  });
  await notifyUsers(
    users.map((u) => u.id),
    type,
    payload,
  );
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
