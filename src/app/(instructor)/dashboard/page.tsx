import { requireInstructor } from "@/lib/session";

export const metadata = { title: "Dashboard" };

// Phase 2 placeholder: proves the protected area works. Phase 3 replaces this
// with the real dashboard (classroom counts, open activities, ...). It shows no
// invented numbers on purpose.
export default async function DashboardPage() {
  const instructor = await requireInstructor();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome, {instructor.fullName}</h1>
      <p className="text-muted-foreground">Signed in as {instructor.email}.</p>
    </div>
  );
}
