import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { ToastProvider } from "@/components/ui/toast";
import { requireInstructor } from "@/lib/session";

// Every page inside the (instructor) group is protected here. This check alone
// is NOT enough for data: layouts are not re-run on client-side navigation
// between sibling pages, so each page and API route that loads data must call
// requireInstructor() / requireInstructorApi() itself (see docs/PHASE2_AUTH.md).
export default async function InstructorLayout({ children }: { children: ReactNode }) {
  const instructor = await requireInstructor();

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <AppSidebar fullName={instructor.fullName} email={instructor.email} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader variant="instructor" />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-10">{children}</main>
        </div>
      </div>
      <MobileNavigation />
    </ToastProvider>
  );
}
