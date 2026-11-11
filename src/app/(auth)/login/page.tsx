import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentInstructor } from "@/lib/session";

export const metadata = { title: "Instructor login" };

export default async function LoginPage() {
  // Already signed in? Skip the form.
  if (await getCurrentInstructor()) redirect("/dashboard");
  return <LoginForm />;
}
