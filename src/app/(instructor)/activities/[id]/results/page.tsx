// Instructor's live view of one activity: participants, submissions, scores and question statistics.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ParticipantTable } from "@/components/results/participant-table";
import { AutoRefresh } from "@/components/results/auto-refresh";
import { toPositiveId } from "@/lib/builder-validation";
import { formatDateTime } from "@/lib/format";
import { orNotFound } from "@/lib/page-helpers";
import { requireInstructor } from "@/lib/session";
import { getActivityResults } from "@/services/results.service";

export const metadata = { title: "Results" };

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireInstructor();
  const id = toPositiveId((await params).id);
  if (id === null) notFound();
  const data = await orNotFound(getActivityResults(instructor.id, id));
  const live = data.activity.status === "OPEN" && !data.activity.archived;

  return (
    <div className="space-y-6">
      {live && <AutoRefresh intervalSeconds={10} />}
      <div className="space-y-2">
        <Link href={`/activities/${data.activity.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to activity
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{data.activity.title}</h1>
          <Badge variant={live ? "published" : "draft"}>
            {data.activity.archived ? "Archived" : data.activity.status === "OPEN" ? "Open" : data.activity.status === "CLOSED" ? "Closed" : "Draft"}
          </Badge>
          {live && <span className="text-xs text-muted-foreground">Refreshes every 10 seconds</span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader><CardDescription>Participants</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">{data.summary.participantCount}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Submitted</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">{data.summary.submittedCount}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Average (first attempts)</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">
            {data.summary.averagePercentage === null ? "—" : `${data.summary.averagePercentage}%`}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
          <CardDescription>Names are shown only to you, the instructor. Students never see each other&apos;s names.</CardDescription>
        </CardHeader>
        <CardContent>
          <ParticipantTable activityId={data.activity.id} participants={data.participants} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question statistics</CardTitle>
          <CardDescription>How many students answered each question, and how many got it right.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.questionStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.questionStats.map((q) => (
                <li key={q.questionId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>{q.position}. {q.questionText}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {q.correct} of {q.answered} correct · {q.points} {q.points === 1 ? "point" : "points"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Results as of {formatDateTime(new Date().toISOString())}. <Link className={buttonVariants({ variant: "link", size: "sm" })} href={`/activities/${data.activity.id}/results`}>Refresh now</Link>
      </p>
    </div>
  );
}
