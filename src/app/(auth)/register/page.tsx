import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentInstructor } from "@/lib/session";

export const metadata = { title: "Create instructor account" };

export default async function RegisterPage() {
  if (await getCurrentInstructor()) redirect("/dashboard");
  return <RegisterForm />;
}
