import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isExpired } from "@/lib/tokens";
import { assignableRoles, roleLabel } from "@/lib/roles";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";
import { revokeInviteAction } from "./actions";

export const metadata = { title: "Invites — Drum Major Portal" };

export default async function InvitesPage() {
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const invites = await prisma.invite.findMany({
    where: { acceptedAt: null },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: { select: { name: true } } },
  });

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Invites</h1>

      <Card>
        <CardHeader>
          <CardTitle>Send an invite</CardTitle>
          <CardDescription>They&apos;ll get an email link to create their account.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm roles={assignableRoles(user.role)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {invites.map((inv) => {
                const expired = isExpired(inv.expiresAt);
                return (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <span>
                      {inv.email} · {roleLabel(inv.role)}{" "}
                      <span className="text-muted-foreground">by {inv.invitedBy.name}</span>
                      {expired ? <Badge variant="destructive" className="ml-2">Expired</Badge> : null}
                    </span>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Revoke
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
