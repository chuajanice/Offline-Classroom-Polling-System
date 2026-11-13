"use client";

// The student's answer sheet. Only the server decides what is shown: questions appear
// only when the attempt is "ready". Correct answers are never part of this data.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { requestJson } from "@/lib/request-json";
import { CTA_CLASSES } from "@/lib/ui-classes";
import type { StudentActivityDto } from "@/services/student.service";

export function StudentActivity({ view }: { view: StudentActivityDto }) {
  const router = useRouter();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Countdown for a timed attempt. When it reaches zero, ask the server what happened.
  useEffect(() => {
    if (!view.attempt.deadline || view.attempt.state !== "ready") return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.parse(view.attempt.deadline!) <= Date.now()) {
        clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [view.attempt.deadline, view.attempt.state, router]);

  const unanswered = view.questions.filter((q) => answers[q.id] === undefined).length;
  const remainingSeconds = view.attempt.deadline
    ? Math.max(0, Math.floor((Date.parse(view.attempt.deadline) - now) / 1000))
    : null;

  async function submit() {
    setPending(true);
    const payload = {
      answers: Object.entries(answers).map(([questionId, choiceId]) => ({
        questionId: Number(questionId),
        choiceId,
      })),
    };
    const result = await requestJson("POST", `/api/student/activities/${view.activity.id}/submissions`, payload);
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      toast({ variant: "error", title: "Your answers were not submitted", description: result.error.message });
      router.refresh();
      return;
    }
    toast({ title: "Submitted", description: "Your score is shown below." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{view.activity.title}</h1>
          <Badge variant={view.activity.status === "OPEN" ? "published" : "draft"}>
            {view.activity.status === "OPEN" ? "Open" : "Closed"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">Signed in as {view.participant.displayName}</p>
        {view.activity.instructions && (
          <p className="whitespace-pre-line rounded-lg bg-background p-3 text-sm">{view.activity.instructions}</p>
        )}
      </div>

      {view.attempt.state === "ready" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              Attempt {view.attempt.number} of {view.activity.maxAttempts}
            </span>
            {remainingSeconds !== null ? (
              <span className="font-medium tabular-nums" aria-live="off">
                Time left: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}
              </span>
            ) : view.activity.closesAt ? (
              <span className="text-muted-foreground">Closes {formatDateTime(view.activity.closesAt)}</span>
            ) : null}
          </div>

          {view.questions.map((q, index) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {index + 1}. {q.questionText}
                </CardTitle>
                <CardDescription>{q.points} {q.points === 1 ? "point" : "points"}</CardDescription>
              </CardHeader>
              <CardContent>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Choose one answer for question {index + 1}</legend>
                  {q.choices.map((c) => (
                    <label
                      key={c.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"
                    >
                      <input
                        type="radio"
                        name={`question-${q.id}`}
                        value={c.id}
                        checked={answers[q.id] === c.id}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                        className="size-5 shrink-0 accent-orange-500"
                      />
                      <span className="text-sm">{c.choiceText}</span>
                    </label>
                  ))}
                </fieldset>
              </CardContent>
            </Card>
          ))}

          <Button
            className={`${CTA_CLASSES} h-12 w-full text-base`}
            disabled={pending || view.questions.length === 0}
            onClick={() => (unanswered > 0 ? setConfirming(true) : submit())}
          >
            {pending ? "Submitting…" : "Submit answers"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can submit once per attempt. Your answers are saved only when you submit.
          </p>

          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Submit with blank questions?"
            description={`${unanswered} ${unanswered === 1 ? "question is" : "questions are"} unanswered. Unanswered questions score zero. You cannot change your answers after submitting.`}
            confirmLabel="Submit anyway"
            pending={pending}
            onConfirm={submit}
          />
        </>
      )}

      {view.attempt.state === "timeUp" && (
        <Alert>
          <AlertDescription>
            Your time for this attempt has run out, so the questions are no longer available. Ask your instructor if you need help.
          </AlertDescription>
        </Alert>
      )}

      {view.attempt.state === "finished" && (
        <Alert>
          <AlertDescription>You have submitted all the attempts allowed for this activity.</AlertDescription>
        </Alert>
      )}

      {view.attempt.state === "closed" && (
        <Alert>
          <AlertDescription>
            This activity is closed. {view.results.length === 0 ? "You did not submit an answer." : "Your results are below."}
          </AlertDescription>
        </Alert>
      )}

      {view.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your results</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {view.results.map((r) => (
                <li key={r.attemptNumber} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>Attempt {r.attemptNumber}</span>
                  <span className="font-semibold tabular-nums">
                    {r.score} / {r.maxScore} points ({r.percentage}%)
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
