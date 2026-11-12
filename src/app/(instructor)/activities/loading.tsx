import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading activities">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
