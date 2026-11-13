import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityActions } from "@/components/activities/activity-actions";
import { toPositiveId } from "@/lib/builder-validation";
import { formatDateTime } from "@/lib/format";
import { orNotFound } from "@/lib/page-helpers";
import { requireInstructor } from "@/lib/session";
import { getActivity } from "@/services/activity.service";
import { notFound } from "next/navigation";

export const metadata = { title: "Activity" };

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireInstructor();
  const id = toPositiveId((await params).id);
  if (id === null) notFound();
  const activity = await orNotFound(getActivity(instructor.id, id));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/activities" className="text-sm text-muted-foreground hover:underline">
          ← All activities
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{activity.title}</h1>
              <Badge variant={activity.isPublished ? "published" : "draft"}>
                {activity.isPublished ? "Published" : "Draft"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{activity.classroomName}</p>
          </div>
          <ActivityActions
            activityId={activity.id}
            status={activity.status}
            isPublished={activity.isPublished}
            isArchived={activity.archivedAt !== null}
            classroomArchived={activity.classroomArchived}
            participantCount={activity.participantCount}
          />
        </div>
        {activity.status === "DRAFT" && activity.isPublished && (
          <p className="text-sm text-muted-foreground">
            Saving changes to a published activity returns it to draft, so you will need to publish it again.
          </p>
        )}
        {activity.archivedAt && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            This activity is archived. It keeps its questions and history, and cannot accept sessions until restored.
          </p>
        )}
        {activity.status === "OPEN" && activity.sessionCode && (
          <div className="rounded-xl bg-linear-to-r from-orange-50 to-amber-50 p-4 ring-1 ring-orange-200">
            <p className="text-sm text-muted-foreground">Session code (students join at /join)</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.25em] text-orange-700" data-testid="session-code">
              {activity.sessionCode}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader><CardDescription>Opens</CardDescription></CardHeader>
          <CardContent className="font-medium">{formatDateTime(activity.opensAt)}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Closes</CardDescription></CardHeader>
          <CardContent className="font-medium">{formatDateTime(activity.closesAt)}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Duration</CardDescription></CardHeader>
          <CardContent className="font-medium">
            {activity.durationMinutes ? `${activity.durationMinutes} minutes` : "No limit"}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Attempts</CardDescription></CardHeader>
          <CardContent className="font-medium">
            {activity.maxAttempts === 2 ? "2 (one retake)" : "1"}
          </CardContent>
        </Card>
      </div>

      {activity.instructions && (
        <Card>
          <CardHeader><CardTitle>Instructions</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-line text-sm">{activity.instructions}</CardContent>
        </Card>
      )}

      <section aria-labelledby="qs" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="qs" className="text-lg font-semibold">
            Questions ({activity.questions.length})
          </h2>
          {activity.status === "DRAFT" && !activity.archivedAt && (
            <Link href={`/activities/${activity.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Edit questions
            </Link>
          )}
        </div>
        {activity.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet.</p>
        ) : (
          activity.questions.map((q) => (
            <Card key={q.id} size="sm">
              <CardHeader>
                <CardTitle className="text-base">
                  {q.position}. {q.questionText}
                </CardTitle>
                <CardDescription>{q.points} {q.points === 1 ? "point" : "points"}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {q.choices.map((c) => (
                    <li key={c.id} className={c.isCorrect ? "font-medium text-emerald-700" : "text-muted-foreground"}>
                      {String.fromCharCode(64 + c.position)}. {c.choiceText || <em>(empty)</em>}
                      {c.isCorrect && " ✓ correct answer"}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
