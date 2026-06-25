"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { markAllRead } from "@/lib/notify";

export async function markAllReadAction(): Promise<void> {
  const { user } = await requireAuth();
  await markAllRead(user.id);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
