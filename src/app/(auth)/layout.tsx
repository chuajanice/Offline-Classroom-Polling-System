import type { ReactNode } from "react";

// Shared frame for the public login and registration pages.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <p className="text-sm font-medium tracking-wide text-muted-foreground">Offline Classroom Polling</p>
      {children}
    </main>
  );
}
