import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/layout/logout-button";
import { ToastProvider } from "@/components/ui/toast";
import { requireInstructor } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/classrooms", label: "Classrooms" },
  { href: "/activities", label: "Activities" },
] as const;

// Every page inside the (instructor) group is protected here. This check alone
// is NOT enough for data: layouts are not re-run on client-side navigation
// between sibling pages, so each page and API route that loads data must call
// requireInstructor() / requireInstructorApi() itself (see docs/PHASE2_AUTH.md).
export default async function InstructorLayout({ children }: { children: ReactNode }) {
  const instructor = await requireInstructor();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-6">
              <span className="font-semibold bg-linear-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
                Offline Classroom Polling
              </span>
              <nav aria-label="Main" className="flex items-center gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-orange-50 hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-muted-foreground sm:inline">{instructor.fullName}</span>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
