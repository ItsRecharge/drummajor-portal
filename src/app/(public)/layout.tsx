import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/settings";

// Public (unauthenticated) pages. Until first-run setup is done, everything here
// funnels to the wizard.
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupComplete())) redirect("/setup");
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-12">
      {children}
    </main>
  );
}
