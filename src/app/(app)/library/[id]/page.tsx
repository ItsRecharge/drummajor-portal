import { notFound, redirect } from "next/navigation";
import { getItem } from "@/lib/library";
import { LibraryBrowser } from "../library-browser";

export const metadata = { title: "Library — Drum Major Portal" };

export default async function LibraryFolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();
  // Files have no folder view — bounce to their Drive link.
  if (item.type === "FILE") redirect(`/library/${id}/open`);
  return <LibraryBrowser folderId={id} />;
}
