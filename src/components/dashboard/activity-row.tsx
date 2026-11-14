import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { ActivitySummaryDto } from "@/lib/dto-types";

// The row is clickable as a whole. The title link's ::after covers the row, so there
// are no nested interactive elements, and keyboard focus shows a ring on the row.
export function ActivityRow({ activity }: { activity: ActivitySummaryDto }) {
  return (
    <li className="relative flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
      <div className="min-w-0">
        <Link
          href={`/activities/${activity.id}`}
          className="font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
        >
          {activity.title}
        </Link>
        <p className="truncate text-sm text-muted-foreground">
          {activity.classroomName} · updated {formatDateTime(activity.updatedAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={activity.isPublished ? "published" : "draft"}>
          {activity.isPublished ? "Published" : "Draft"}
        </Badge>
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </div>
    </li>
  );
}
