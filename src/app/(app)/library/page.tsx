import { LibraryBrowser } from "./library-browser";

export const metadata = { title: "Library — Drum Major Portal" };

export default function LibraryRootPage() {
  return <LibraryBrowser folderId={null} />;
}
