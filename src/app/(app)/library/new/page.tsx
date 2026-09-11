import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddMusicForm } from "./add-music-form";

export const metadata = { title: "Add music — Drum Major Portal" };

export default async function AddMusicPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add music</CardTitle>
        <CardDescription>
          Creates a folder in the shared Drive under the category and names every PDF by the parts it holds,
          e.g. <span className="font-mono">Title - Flute 1 to Clarinet 2.pdf</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddMusicForm />
      </CardContent>
    </Card>
  );
}
