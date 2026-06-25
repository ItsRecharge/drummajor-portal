import { prisma } from "@/lib/prisma";

// AppSettings is a single-row table. These helpers centralize reads of it.
export async function getAppSettings() {
  return prisma.appSettings.findFirst();
}

export async function isSetupComplete(): Promise<boolean> {
  const settings = await prisma.appSettings.findFirst({ select: { setupComplete: true } });
  return settings?.setupComplete ?? false;
}

// Ensures the single AppSettings row exists and returns its id.
export async function ensureAppSettings(): Promise<string> {
  const existing = await prisma.appSettings.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.appSettings.create({ data: {} });
  return created.id;
}
