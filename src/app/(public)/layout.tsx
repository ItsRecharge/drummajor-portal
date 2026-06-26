import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { isSetupComplete } from "@/lib/settings";

// Public (unauthenticated) pages. Until first-run setup is done, everything here
// funnels to the wizard.
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupComplete())) redirect("/setup");
  return (
    <main className="field-grid flex min-h-full w-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
            <Flag className="size-5" />
          </span>
          <span className="font-[family-name:var(--font-display)] leading-none tracking-wide uppercase">
            <span className="block text-base font-bold">Drum Major</span>
            <span className="block text-sm font-semibold text-muted-foreground">Portal</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
