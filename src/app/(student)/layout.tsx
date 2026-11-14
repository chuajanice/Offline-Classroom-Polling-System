// Student area: no login. Students are identified only by their participant cookie for one activity.
import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { ToastProvider } from "@/components/ui/toast";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="app-viewport flex flex-col">
        <AppHeader variant="student" />
        <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
