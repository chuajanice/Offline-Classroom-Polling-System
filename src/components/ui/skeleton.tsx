import { cn } from "@/lib/utils";

/** Placeholder block used by loading.tsx files so pages do not jump when data arrives. */
function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

export { Skeleton };
