import Link from "next/link";
import { Badge } from "@/components/ui/badge";
//import { Button, buttonVariants } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireInstructor } from "@/lib/session";
import { CTA_CLASSES } from "@/lib/ui-classes";
import { listActivities } from "@/services/activity.service";
import { listClassrooms } from "@/services/classroom.service";
import { toPositiveId } from "@/lib/builder-validation";
import { Plus } from "lucide-react";
import { ClassroomFilter } from "@/components/activities/classroom-filter";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const instructor = await requireInstructor();
  const { classroomId: rawClassroomId } = await searchParams;
  const filterId = rawClassroomId ? toPositiveId(rawClassroomId) ?? undefined : undefined;

  const [classrooms, activities] = await Promise.all([
    listClassrooms(instructor.id),
    listActivities(instructor.id, filterId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Activities</h1>
          <p className="text-sm text-muted-foreground">Drafts and published activities across your classrooms.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/activities/archived" className={buttonVariants({ variant: "outline" })}>Archived</Link>
        <Link href="/activities/new" className={buttonVariants({ className: CTA_CLASSES })}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          New activity
        </Link>
        </div>
      </div>

      <ClassroomFilter
        classrooms={classrooms}
        initialValue={filterId ? String(filterId) : ""}
      />

      {activities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">No activities yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {classrooms.length === 0
                ? "Create a classroom first, then add your first activity."
                : "Create an activity to start writing questions."}
            </p>
            <Link
              href={classrooms.length === 0 ? "/classrooms" : "/activities/new"}
              className={buttonVariants({ className: CTA_CLASSES })}
            >
              {classrooms.length === 0 ? "Go to classrooms" : "Create an activity"}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-background ring-1 ring-foreground/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Classroom</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Opens</th>
                <th className="px-4 py-3 font-medium">Closes</th>
                <th className="px-4 py-3 text-right font-medium">Questions</th>
                <th className="px-4 py-3 font-medium">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={activity.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/activities/${activity.id}`} className="font-medium hover:underline">
                      {activity.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{activity.classroomName}</td>
                  <td className="px-4 py-3">
                    <Badge variant={activity.isPublished ? "published" : "draft"}>
                      {activity.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(activity.opensAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(activity.closesAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{activity.questionCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(activity.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
