import { prisma } from "@/lib/prisma";
import { isExpired } from "@/lib/tokens";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptForm } from "./accept-form";

export const metadata = { title: "Accept invite — Drum Major Portal" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { invitedBy: { select: { name: true } } },
  });

  const invalid = !invite || invite.acceptedAt || isExpired(invite.expiresAt);
  if (invalid) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invite unavailable</CardTitle>
          <CardDescription>This invite is invalid, already used, or expired.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re invited</CardTitle>
        <CardDescription>
          {invite.invitedBy.name} invited you to the Drum Major Portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptForm token={token} email={invite.email} />
      </CardContent>
    </Card>
  );
}
