import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/settings";
import { getSession } from "@/lib/session";

// Entry point: route to setup, dashboard, or login depending on state.
export default async function Home() {
  if (!(await isSetupComplete())) redirect("/setup");
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
