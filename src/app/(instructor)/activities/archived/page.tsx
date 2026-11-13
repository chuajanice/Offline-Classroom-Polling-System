import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireInstructor } from "@/lib/session";
import { listActivities } from "@/services/activity.service";

export const metadata = { title: "Archived activities" };

export default async function ArchivedActivitiesPage() {
  const instructor = await requireInstructor();
  const activities = await listActivities(instructor.id, undefined, true);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Archived activities</h1>
          <p className="text-sm text-muted-foreground">Archived activities keep their questions, schedules and results. Restore one to use it again.</p>
        </div>
        <Link href="/activities" className={buttonVariants({ variant: "outline" })}>Back to activities</Link>
      </div>

      {activities.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No archived activities.</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {activities.map((a) => (
            <li key={a.id}>
              <Card size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/activities/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                    <p className="text-sm text-muted-foreground">
                      {a.classroomName} · archived {formatDateTime(a.archivedAt)} · {a.questionCount} questions
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{a.status === "CLOSED" ? "Closed" : a.isPublished ? "Published" : "Draft"}</Badge>
                    <ActionButton url={`/api/activities/${a.id}/restore`} successTitle="Activity restored" variant="outline" size="sm">
                      Restore
                    </ActionButton>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
