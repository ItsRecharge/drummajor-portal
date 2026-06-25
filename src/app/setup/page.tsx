import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgStep, AdminStep, SmtpStep, DriveStep } from "./wizard";

export const metadata = { title: "Setup — Drum Major Portal" };

const STEPS = [
  { key: "org", title: "Organization", description: "Tell us about your school and band." },
  { key: "admin", title: "First admin", description: "Create the top-level admin account." },
  { key: "smtp", title: "Email (SMTP)", description: "Connect the band's Gmail for sending mail." },
  { key: "drive", title: "Google Drive", description: "Optional — connect Drive for the music library." },
] as const;

export default async function SetupPage() {
  const [org, userCount, settings] = await Promise.all([
    prisma.organization.findFirst(),
    prisma.user.count(),
    getAppSettings(),
  ]);

  if (settings?.setupComplete) redirect("/dashboard");

  let step: (typeof STEPS)[number]["key"];
  if (!org) step = "org";
  else if (userCount === 0) step = "admin";
  else if (!settings?.smtpConfigEnc) step = "smtp";
  else step = "drive";

  const index = STEPS.findIndex((s) => s.key === step);
  const meta = STEPS[index];

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-12">
      <p className="mb-2 text-sm text-muted-foreground">
        Step {index + 1} of {STEPS.length}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "org" && <OrgStep />}
          {step === "admin" && <AdminStep />}
          {step === "smtp" && <SmtpStep />}
          {step === "drive" && <DriveStep />}
        </CardContent>
      </Card>
    </main>
  );
}
