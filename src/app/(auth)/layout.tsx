import type { ReactNode } from "react";
import { PerformanceModeSelector } from "@/components/theme/performance-mode-selector";
import { ThemeToggle } from "@/components/theme/theme-toggle";

// Shared frame for the public login and registration pages.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <PerformanceModeSelector className="w-32 sm:w-36" />
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-lg font-semibold tracking-tight">Pollify</p>
        <p className="text-sm text-muted-foreground">Offline classroom polling</p>
      </div>
      {children}
    </main>
  );
}
