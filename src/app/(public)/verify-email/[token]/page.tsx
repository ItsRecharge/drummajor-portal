import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "Verify email — Drum Major Portal" };

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>Confirm this address to activate your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyForm token={token} />
      </CardContent>
    </Card>
  );
}
