"use server";

import { redirect } from "next/navigation";
import { destroyCurrentSession } from "@/lib/session";
import { stopImpersonation } from "@/lib/impersonation";

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export async function stopImpersonationAction(): Promise<void> {
  await stopImpersonation();
  redirect("/admin/users");
}
