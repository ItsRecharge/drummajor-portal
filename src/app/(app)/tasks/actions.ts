"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { taskSchema } from "@/lib/validation";
import { createNotification } from "@/lib/notify";
import { Role, TaskStatus } from "@/generated/prisma/client";

const TASK_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...TASK_ROLES);
  const parsed = parseForm(taskSchema, formData);
  if (!parsed.ok) return parsed.state;

  const assigneeId = parsed.data.assigneeId || null;
  const task = await prisma.task.create({
    data: { title: parsed.data.title, assigneeId },
  });
  await logAudit({ actorId: actor.id, action: "TASK_CREATED", target: task.title });
  if (assigneeId) {
    await createNotification(assigneeId, "TASK_ASSIGNED", { title: task.title });
  }
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { success: true, message: "Task added." };
}

const STATUSES = new Set<string>(Object.values(TaskStatus));

export async function moveTaskAction(formData: FormData): Promise<void> {
  await requireRole(...TASK_ROLES);
  const id = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.has(status)) return;
  await prisma.task.update({ where: { id }, data: { status: status as TaskStatus } });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  await requireRole(...TASK_ROLES);
  const id = String(formData.get("taskId") ?? "");
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
