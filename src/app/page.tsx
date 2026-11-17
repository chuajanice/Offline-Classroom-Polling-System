
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinForm } from "@/components/student/join-form";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentInstructor } from "@/lib/session";

export const metadata = { title: "Pollify" };

export default async function HomePage() {
  if (await getCurrentInstructor()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Pollify</h1>
          <p className="text-muted-foreground">
            Join your classroom activity using the session code from your instructor.
          </p>
        </div>

        <JoinForm />

        <div className="text-center">
          <Link
            href="/login"
            className={buttonVariants({ variant: "link" })}
          >
            Instructor? Log in here
          </Link>
        </div>
      </div>
    </main>
  );
}
