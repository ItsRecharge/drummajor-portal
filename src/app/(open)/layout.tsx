import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { isSetupComplete } from "@/lib/settings";
import { getBandName } from "@/lib/leadership";

// Open (no-login) pages meant for students and families: the public calendar
// and absence appeals. Wide layout, band name in the header, no app nav.
export default async function OpenLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const bandName = (await getBandName()) ?? "Band";
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/calendar" className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Flag className="size-4" />
            </span>
            <span className="font-[family-name:var(--font-display)] leading-none tracking-wide uppercase">
              <span className="block text-sm font-bold">{bandName}</span>
              <span className="block text-xs font-semibold text-muted-foreground">Calendar</span>
            </span>
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Leadership login
          </Link>
        </div>
      </header>
      <main className="field-grid flex-1 px-4 py-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
