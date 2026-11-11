import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentInstructor } from "@/lib/session";

export const metadata = { title: "Offline Classroom Polling" };

// Public entry point. Replaces the default create-next-app home page.
export default async function HomePage() {
  if (await getCurrentInstructor()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Offline Classroom Polling</h1>
        <p className="text-muted-foreground">Run live classroom activities on your own network. No internet required.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/login" className={buttonVariants()}>
          Instructor login
        </Link>
        <Link href="/register" className={buttonVariants({ variant: "outline" })}>
          Create instructor account
        </Link>
      </div>
    </main>
  );
}
