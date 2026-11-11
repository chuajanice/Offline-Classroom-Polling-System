import type { ReactNode } from "react";
import { LogoutButton } from "@/components/layout/logout-button";
import { requireInstructor } from "@/lib/session";

// Every page inside the (instructor) group is protected here. This check alone
// is NOT enough for data: layouts are not re-run on client-side navigation
// between sibling pages, so each page and API route that loads data must call
// requireInstructor() / requireInstructorApi() itself (see docs/PHASE2_AUTH.md).
export default async function InstructorLayout({ children }: { children: ReactNode }) {
  const instructor = await requireInstructor();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-semibold">Offline Classroom Polling</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">{instructor.fullName}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
