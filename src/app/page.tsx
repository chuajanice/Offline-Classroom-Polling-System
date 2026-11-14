import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentInstructor } from "@/lib/session";
import { CTA_CLASSES } from "@/lib/ui-classes";

export const metadata = { title: "Pollify" };

// Public entry point.
export default async function HomePage() {
  if (await getCurrentInstructor()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pollify</h1>
        <p className="text-muted-foreground">Run live classroom activities on your own network. No internet required.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/login" className={buttonVariants({ className: CTA_CLASSES })}>
          Instructor login
        </Link>
        <Link href="/register" className={buttonVariants({ variant: "outline" })}>
          Create instructor account
        </Link>
      </div>
    </main>
  );
}
