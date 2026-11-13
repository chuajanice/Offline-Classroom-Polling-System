// Instructor results dashboard (Phase 5): activity and classroom details, summary figures,
// every participant's attempts kept separately, the current result, and the PDF report.
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

const STATE_LABEL = { DRAFT: "Draft", OPEN: "Open", CLOSED: "Closed" } as const;

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireInstructor();
  const id = toPositiveId((await params).id);
  if (id === null) notFound();
  const data = await orNotFound(getActivityResults(instructor.id, id));
  const live = data.activity.status === "OPEN" && !data.activity.archived;
  const totalSubmissions = data.participants.reduce((n, p) => n + p.attempts.length, 0);
  const stateLabel = data.activity.archived ? "Archived" : STATE_LABEL[data.activity.status as keyof typeof STATE_LABEL] ?? data.activity.status;

  return (
    <div className="space-y-6">
      {live && <AutoRefresh intervalSeconds={10} />}

      <div className="space-y-3">
        <Link href={`/activities/${data.activity.id}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to activity
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Results: {data.activity.title}</h1>
              <Badge variant={live ? "published" : "draft"}>{stateLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {data.classroom.name}
              {data.classroom.archived && " (archived classroom)"}
              {" · "}Instructor {data.instructor.fullName}
            </p>
          </div>
          <a
            href={`/api/activities/${data.activity.id}/report`}
            download
            className={buttonVariants({ className: "border-transparent bg-linear-to-r from-orange-500 to-amber-500 text-white" })}
          >
            Download PDF report
          </a>
        </div>
        {live && <p className="text-xs text-muted-foreground">Refreshes every 10 seconds.</p>}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Activity details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Detail label="Classroom" value={data.classroom.name} />
          <Detail label="Attempts allowed" value={String(data.activity.maxAttempts)} />
          <Detail label="Opened" value={data.activity.openedAt ? formatDateTime(data.activity.openedAt) : "Not opened"} />
          <Detail label="Closed" value={data.activity.closedAt ? formatDateTime(data.activity.closedAt) : "Not closed"} />
          <Detail label="Scheduled to open" value={formatDateTime(data.activity.scheduledOpensAt)} />
          <Detail label="Scheduled to close" value={formatDateTime(data.activity.scheduledClosesAt)} />
          <Detail label="Questions" value={`${data.activity.questionCount} (maximum score ${data.activity.maxScore})`} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader><CardDescription>Total participants</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">{data.summary.participantCount}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Total submissions</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">{totalSubmissions}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Average, first attempts</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">
            {data.summary.averagePercentage === null ? "—" : `${data.summary.averagePercentage}%`}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Average, current results</CardDescription></CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">
            {data.summary.averageCurrentPercentage === null ? "—" : `${data.summary.averageCurrentPercentage}%`}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
          <CardDescription>
            Attempts are kept separately. The current result is the latest accepted attempt. Names are visible only to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParticipantTable activityId={data.activity.id} participants={data.participants} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question statistics</CardTitle>
          <CardDescription>How many answers each question received, and how many were correct.</CardDescription>
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
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
