import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireInstructor } from "@/lib/session";
import { listArchivedClassrooms } from "@/services/classroom.service";

export const metadata = { title: "Archived classrooms" };

export default async function ArchivedClassroomsPage() {
  const instructor = await requireInstructor();
  const classrooms = await listArchivedClassrooms(instructor.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Archived classrooms</h1>
          <p className="text-sm text-muted-foreground">Restoring a classroom does not reopen its activities. Open them again yourself.</p>
        </div>
        <Link href="/classrooms" className={buttonVariants({ variant: "outline" })}>Back to classrooms</Link>
      </div>

      {classrooms.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No archived classrooms.</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {classrooms.map((c) => (
            <li key={c.id}>
              <Card size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.classroomName}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.activityCount} {c.activityCount === 1 ? "activity" : "activities"} · archived {formatDateTime(c.archivedAt)}
                    </p>
                  </div>
                  <ActionButton url={`/api/classrooms/${c.id}/restore`} successTitle="Classroom restored" variant="outline" size="sm">
                    Restore
                  </ActionButton>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
