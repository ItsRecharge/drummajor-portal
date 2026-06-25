import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { markAllReadAction } from "./actions";

export const metadata = { title: "Notifications — Drum Major Portal" };

// Render a short, human line from a notification's type + payload.
function summarize(type: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "ANNOUNCEMENT":
      return `New announcement: ${p.subject ?? ""}`;
    case "TASK_ASSIGNED":
      return `You were assigned a task: ${p.title ?? ""}`;
    case "MUSIC_ADDED":
      return `New music added: ${p.title ?? ""}`;
    case "EVENT":
      return `New event: ${p.title ?? ""}${p.when ? ` (${p.when})` : ""}`;
    case "NOTE_VOTE":
      return `${p.voter ?? "Someone"} upvoted your idea`;
    case "NOTE_COMMENT":
      return `${p.commenter ?? "Someone"} commented on your idea`;
    default:
      return type;
  }
}

export default async function NotificationsPage() {
  const { user } = await requireAuth();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {hasUnread ? (
          <form action={markAllReadAction}>
            <Button type="submit" size="sm" variant="outline">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>Nothing yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-2">
          {notifications.map((n) => (
            <Card key={n.id} className={n.readAt ? "" : "border-l-4 border-l-primary"}>
              <CardContent className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{summarize(n.type, n.payload)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {n.createdAt.toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
