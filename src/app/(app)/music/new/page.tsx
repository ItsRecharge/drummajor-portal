import { requireRole } from "@/lib/auth";
import { isDriveConfigured } from "@/lib/drive";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieceForm } from "../music-form";
import { addPieceAction } from "../actions";

export const metadata = { title: "Add music — Drum Major Portal" };

export default async function NewMusicPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  const driveReady = await isDriveConfigured();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a piece</CardTitle>
        <CardDescription>
          A folder is created under the Band Library on Google Drive and your PDFs uploaded into it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!driveReady ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Google Drive isn&apos;t configured yet. Finish the Drive step in setup before uploading.
          </p>
        ) : null}
        <PieceForm action={addPieceAction} withFiles submitLabel="Add piece" />
      </CardContent>
    </Card>
  );
}
