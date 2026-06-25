import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, type Prisma } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Logs — Drum Major Portal" };

// "EVENT_CREATED" -> "Event created"
function humanize(action: string): string {
  const s = action.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TAKE = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  await requireRole(Role.ADMIN);
  const { view, q } = await searchParams;
  const security = view === "security";
  const query = (q ?? "").trim();

  const auditWhere: Prisma.AuditLogWhereInput = query
    ? {
        OR: [
          { action: { contains: query, mode: "insensitive" } },
          { target: { contains: query, mode: "insensitive" } },
          { actor: { name: { contains: query, mode: "insensitive" } } },
        ],
      }
    : {};
  const securityWhere: Prisma.SecurityLogWhereInput = query
    ? {
        OR: [
          { action: { contains: query, mode: "insensitive" } },
          { actor: { name: { contains: query, mode: "insensitive" } } },
          { target: { name: { contains: query, mode: "insensitive" } } },
        ],
      }
    : {};

  const [audit, securityRows] = await Promise.all([
    security
      ? Promise.resolve([])
      : prisma.auditLog.findMany({
          where: auditWhere,
          orderBy: { createdAt: "desc" },
          take: TAKE,
          include: { actor: { select: { name: true } } },
        }),
    security
      ? prisma.securityLog.findMany({
          where: securityWhere,
          orderBy: { createdAt: "desc" },
          take: TAKE,
          include: { actor: { select: { name: true } }, target: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`;
  const qs = query ? `&q=${encodeURIComponent(query)}` : "";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          The activity log records uploads, sends, deletes, and role changes. The security log is
          separate and records impersonation events only.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link href={`/audit?view=activity${qs}`} className={tabClass(!security)}>
          Activity
        </Link>
        <Link href={`/audit?view=security${qs}`} className={tabClass(security)}>
          Security
        </Link>
      </div>

      <form method="get" className="flex gap-2">
        <input type="hidden" name="view" value={security ? "security" : "activity"} />
        <input
          name="q"
          defaultValue={query}
          placeholder="Search action, target, or person…"
          className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {security ? (
        securityRows.length === 0 ? (
          <EmptyCard query={query} />
        ) : (
          <div className="grid gap-2">
            {securityRows.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{r.actor?.name ?? "—"}</span>{" "}
                    {humanize(r.action).toLowerCase()}
                    {r.target ? (
                      <>
                        {" "}
                        → <span className="font-medium">{r.target.name}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.createdAt.toLocaleString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : audit.length === 0 ? (
        <EmptyCard query={query} />
      ) : (
        <div className="grid gap-2">
          {audit.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{r.actor?.name ?? "System"}</span>{" "}
                  {humanize(r.action).toLowerCase()}
                  {r.target ? (
                    <>
                      : <span className="text-muted-foreground">{r.target}</span>
                    </>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.createdAt.toLocaleString()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyCard({ query }: { query: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{query ? "No matches" : "Nothing logged yet"}</CardTitle>
      </CardHeader>
    </Card>
  );
}
