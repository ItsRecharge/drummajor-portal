import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { assignableRoles } from "@/lib/roles";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersManager } from "./users-manager";

export const metadata = { title: "Members — Drum Major Portal" };

export default async function MembersPage() {
  const { user } = await requireRole(Role.ADMIN);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  const members = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    verified: !!u.emailVerified,
  }));

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Members</h1>
      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            Edit details, change roles, override credentials, transfer admin, or impersonate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersManager members={members} currentUserId={user.id} roles={assignableRoles(user.role)} />
        </CardContent>
      </Card>
    </div>
  );
}
