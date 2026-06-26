import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Drum Major Portal" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <Card className="border-t-2 border-t-primary">
      <CardHeader>
        <p className="eyebrow">Sideline · Sign in</p>
        <CardTitle className="text-2xl uppercase tracking-wide">Sign in</CardTitle>
        <CardDescription>Enter your credentials to continue.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {reset ? (
          <p className="text-sm text-success">Password updated. You can sign in now.</p>
        ) : null}
        <LoginForm />
      </CardContent>
    </Card>
  );
}
