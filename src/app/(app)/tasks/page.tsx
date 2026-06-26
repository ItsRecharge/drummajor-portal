import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, TaskStatus } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskForm } from "./task-form";
import { moveTaskAction, deleteTaskAction } from "./actions";

export const metadata = { title: "Tasks — Drum Major Portal" };

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: TaskStatus.TODO, label: "To Do" },
  { status: TaskStatus.IN_PROGRESS, label: "In Progress" },
  { status: TaskStatus.COMPLETED, label: "Completed" },
];

export default async function TasksPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      orderBy: { createdAt: "asc" },
      include: { assignee: { select: { name: true } } },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Tasks</h1>
        <p className="text-sm text-muted-foreground">Assign and track work across the team.</p>
      </div>

      <Card>
        <CardContent className="py-4">
          <TaskForm users={users} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          return (
            <Card key={col.status}>
              <CardHeader>
                <CardTitle className="text-base">
                  {col.label} <span className="text-muted-foreground">({colTasks.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {colTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  colTasks.map((t) => (
                    <div key={t.id} className="grid gap-2 rounded-md border p-2 text-sm">
                      <span className="font-medium">{t.title}</span>
                      {t.assignee ? (
                        <span className="text-xs text-muted-foreground">{t.assignee.name}</span>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {COLUMNS.filter((c) => c.status !== col.status).map((c) => (
                          <form key={c.status} action={moveTaskAction}>
                            <input type="hidden" name="taskId" value={t.id} />
                            <input type="hidden" name="status" value={c.status} />
                            <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs">
                              → {c.label}
                            </Button>
                          </form>
                        ))}
                        <form action={deleteTaskAction}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
