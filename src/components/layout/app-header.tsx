import { LogoutButton } from "@/components/layout/logout-button";
import { PerformanceModeSelector } from "@/components/theme/performance-mode-selector";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

// Top bar shared by the instructor and student areas. On desktop the instructor
// brand lives in the sidebar, so the header only shows the controls.
export function AppHeader({ variant }: { variant: "instructor" | "student" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate font-semibold tracking-tight", variant === "instructor" && "lg:hidden")}>
            Pollify
          </span>
          {variant === "student" && <span className="hidden text-sm text-muted-foreground sm:inline">Student</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PerformanceModeSelector className="w-32 sm:w-36" />
          <ThemeToggle />
          {variant === "instructor" && <LogoutButton />}
        </div>
      </div>
    </header>
  );
}
