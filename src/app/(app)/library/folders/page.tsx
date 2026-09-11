import { LibraryBrowser } from "../library-browser";
import { LibraryTabs } from "../library-tabs";

export const metadata = { title: "Library folders — Drum Major Portal" };

export default async function LibraryFoldersPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Library</h1>
        <p className="text-sm text-muted-foreground">The Drive folder as-is. Items open in Google Drive.</p>
      </div>
      <LibraryTabs active="folders" />
      <LibraryBrowser folderId={null} embedded />
    </div>
  );
}
