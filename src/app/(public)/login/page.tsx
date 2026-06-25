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
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Drum Major Portal</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {reset ? (
          <p className="text-sm text-green-600">Password updated. You can sign in now.</p>
        ) : null}
        <LoginForm />
      </CardContent>
    </Card>
  );
}
