import Link from "next/link";
import { ChevronRight, School } from "lucide-react";
import type { ClassroomDto } from "@/lib/dto-types";

// The whole card is one link. It opens the activity list filtered to this classroom.
export function ClassroomCard({ classroom }: { classroom: ClassroomDto }) {
  const count = classroom.activityCount;
  return (
    <Link
      href={`/activities?classroomId=${classroom.id}`}
      className="group flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 shadow-raised transition-colors hover:bg-card/90 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <School aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{classroom.classroomName}</span>
        {classroom.description && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{classroom.description}</span>
        )}
        <span className="mt-2 block text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? "active activity" : "active activities"}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
