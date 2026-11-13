// Student area: no login. Students are identified only by their participant cookie for one activity.
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <span className="font-semibold bg-linear-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
              Offline Classroom Polling
            </span>
            <span className="text-sm text-muted-foreground">Student</span>
          </div>
        </header>
        <main className="mx-auto max-w-2xl p-4 sm:p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
