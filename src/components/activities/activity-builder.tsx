"use client";

// Create / edit form for an activity with its questions and choices.
// The whole activity is saved in one request; the server validates it and
// writes it in a single transaction. "Save draft" accepts incomplete work;
// "Publish" saves, then runs the strict publish checks on the server.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ACTIVITY_LIMITS } from "@/lib/activity-rules";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime";
import type { ActivityDetailDto } from "@/lib/dto-types";
import { requestJson } from "@/lib/request-json";
import { CTA_CLASSES } from "@/lib/ui-classes";

type ClassroomOption = { id: number; classroomName: string };

/** A removal waiting for confirmation. Nothing is removed until the instructor confirms. */
type Removal = { kind: "question"; qi: number } | { kind: "choice"; qi: number; ci: number };

type ChoiceState = { key: string; choiceText: string; isCorrect: boolean };
type QuestionState = { key: string; questionText: string; points: string; choices: ChoiceState[] };
type FormState = {
  classroomId: string;
  title: string;
  instructions: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: string;
  maxAttempts: "1" | "2";
  questions: QuestionState[];
};

// Client-side keys only (never sent). A counter is used instead of crypto.randomUUID,
// which browsers do not provide on plain-HTTP LAN addresses.
let keySequence = 0;
const nextKey = () => `k${++keySequence}`;

const blankChoice = (isCorrect = false): ChoiceState => ({ key: nextKey(), choiceText: "", isCorrect });
const blankQuestion = (): QuestionState => ({
  key: nextKey(),
  questionText: "",
  points: "1",
  choices: [blankChoice(true), blankChoice(false)],
});

function blankForm(classrooms: ClassroomOption[]): FormState {
  return {
    classroomId: classrooms[0] ? String(classrooms[0].id) : "",
    title: "",
    instructions: "",
    opensAt: "",
    closesAt: "",
    durationMinutes: "",
    maxAttempts: "1",
    questions: [blankQuestion()],
  };
}

function formFromActivity(activity: ActivityDetailDto): FormState {
  return {
    classroomId: String(activity.classroomId),
    title: activity.title,
    instructions: activity.instructions ?? "",
    opensAt: isoToLocalInput(activity.opensAt),
    closesAt: isoToLocalInput(activity.closesAt),
    durationMinutes: activity.durationMinutes === null ? "" : String(activity.durationMinutes),
    maxAttempts: activity.maxAttempts === 2 ? "2" : "1",
    questions: activity.questions.map((q) => ({
      key: nextKey(),
      questionText: q.questionText,
      points: String(q.points),
      choices: q.choices.map((c) => ({ key: nextKey(), choiceText: c.choiceText, isCorrect: c.isCorrect })),
    })),
  };
}

/** Form state -> API body. Positions are not sent: the server derives them from array order. */
function toPayload(form: FormState) {
  return {
    classroomId: Number(form.classroomId),
    title: form.title,
    instructions: form.instructions,
    opensAt: localInputToIso(form.opensAt),
    closesAt: localInputToIso(form.closesAt),
    durationMinutes: form.durationMinutes.trim() === "" ? null : Number(form.durationMinutes),
    maxAttempts: Number(form.maxAttempts),
    questions: form.questions.map((q) => ({
      questionText: q.questionText,
      points: Number(q.points),
      choices: q.choices.map((c) => ({ choiceText: c.choiceText, isCorrect: c.isCorrect })),
    })),
  };
}

function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function ActivityBuilder({
  classrooms,
  initial,
}: {
  classrooms: ClassroomOption[];
  initial: ActivityDetailDto | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() =>
    initial ? formFromActivity(initial) : blankForm(classrooms),
  );
  const [savedId, setSavedId] = useState<number | null>(initial?.id ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateQuestions = (fn: (questions: QuestionState[]) => QuestionState[]) =>
    setForm((f) => ({ ...f, questions: fn(f.questions) }));

  const updateQuestion = (qi: number, patch: Partial<QuestionState>) =>
    updateQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const updateChoices = (qi: number, fn: (choices: ChoiceState[]) => ChoiceState[]) =>
    updateQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, choices: fn(q.choices) } : q)));

  function markCorrect(qi: number, ci: number) {
    updateChoices(qi, (choices) => choices.map((c, i) => ({ ...c, isCorrect: i === ci })));
  }

  function confirmRemoval() {
    if (!removal) return;
    if (removal.kind === "question") {
      updateQuestions((qs) => qs.filter((_, i) => i !== removal.qi));
    } else {
      updateChoices(removal.qi, (cs) => cs.filter((_, i) => i !== removal.ci));
    }
    setRemoval(null);
  }

  async function save(mode: "draft" | "publish") {
    setPending(mode);
    setErrors({});

    const payload = toPayload(form);
    const saved =
      savedId === null
        ? await requestJson("POST", "/api/activities", payload)
        : await requestJson("PATCH", `/api/activities/${savedId}`, payload);

    if (!saved.ok) {
      setErrors(saved.error.fields);
      toast({ variant: "error", title: "Could not save the activity", description: saved.error.message });
      setPending(null);
      return;
    }

    const data = saved.data as { activity: ActivityDetailDto; returnedToDraft?: boolean };
    const activityId = data.activity.id;
    if (savedId === null) {
      // Stay on this form (no remount) and reflect the new id in the URL.
      setSavedId(activityId);
      window.history.replaceState(null, "", `/activities/${activityId}/edit`);
    }

    if (mode === "draft") {
      toast({
        title: "Draft saved",
        description: data.returnedToDraft
          ? "Because you changed a published activity, it is a draft again. Publish it when ready."
          : undefined,
      });
      setPending(null);
      return;
    }

    const published = await requestJson("POST", `/api/activities/${activityId}/publish`);
    if (!published.ok) {
      setErrors(published.error.fields);
      toast({ variant: "error", title: "Not published yet", description: published.error.message });
      setPending(null);
      return;
    }

    toast({ title: "Activity published", description: "It is ready. Student participation is not open yet." });
    router.push(`/activities/${activityId}`);
  }

  const err = (key: string) =>
    errors[key] ? (
      <p className="text-sm text-destructive" role="alert">
        {errors[key]}
      </p>
    ) : null;

  const hasErrors = Object.keys(errors).length > 0;
  const busy = pending !== null;
  const noClassrooms = classrooms.length === 0;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold">{savedId === null ? "New activity" : "Edit activity"}</h1>
        <p className="text-sm text-muted-foreground">
          Save as a draft at any time. Publishing checks that every question is complete.
        </p>
      </div>

      {noClassrooms && (
        <Alert>
          <AlertDescription>
            You need a classroom before you can create an activity.{" "}
            <Link href="/classrooms" className="font-medium underline underline-offset-4">
              Create a classroom
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {hasErrors && (
        <Alert variant="destructive">
          <AlertDescription>
            Some items need attention. Check the highlighted fields below.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>What students will see when the activity is opened.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="classroomId">Classroom</Label>
              <select
                id="classroomId"
                value={form.classroomId}
                onChange={(e) => set("classroomId", e.target.value)}
                disabled={noClassrooms}
                aria-invalid={Boolean(errors.classroomId)}
                className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.classroomName}
                  </option>
                ))}
              </select>
              {err("classroomId")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={ACTIVITY_LIMITS.TITLE_MAX}
                aria-invalid={Boolean(errors.title)}
                placeholder="e.g. Quiz 1: Network layers"
              />
              {err("title")}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions (optional)</Label>
            <Textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              maxLength={ACTIVITY_LIMITS.INSTRUCTIONS_MAX}
              rows={3}
            />
            {err("instructions")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule and attempts</CardTitle>
          <CardDescription>
            Times use this computer&apos;s clock. The server checks them when you save and publish.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="opensAt">Opens</Label>
            <Input
              id="opensAt"
              type="datetime-local"
              value={form.opensAt}
              onChange={(e) => set("opensAt", e.target.value)}
              aria-invalid={Boolean(errors.opensAt)}
            />
            {err("opensAt")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="closesAt">Closes</Label>
            <Input
              id="closesAt"
              type="datetime-local"
              value={form.closesAt}
              onChange={(e) => set("closesAt", e.target.value)}
              aria-invalid={Boolean(errors.closesAt)}
            />
            {err("closesAt")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="durationMinutes">Duration in minutes (optional)</Label>
            <Input
              id="durationMinutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={ACTIVITY_LIMITS.DURATION_MAX_MINUTES}
              value={form.durationMinutes}
              onChange={(e) => set("durationMinutes", e.target.value)}
              aria-invalid={Boolean(errors.durationMinutes)}
            />
            {err("durationMinutes")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxAttempts">Attempts allowed</Label>
            <select
              id="maxAttempts"
              value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", e.target.value as "1" | "2")}
              className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="1">1 attempt</option>
              <option value="2">2 attempts (one retake)</option>
            </select>
            {err("maxAttempts")}
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="questions-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="questions-heading" className="text-lg font-semibold">
            Questions ({form.questions.length})
          </h2>
          <Button
            variant="outline"
            onClick={() => updateQuestions((qs) => [...qs, blankQuestion()])}
            disabled={form.questions.length >= ACTIVITY_LIMITS.QUESTIONS_MAX || busy}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add question
          </Button>
        </div>
        {err("questions")}

        {form.questions.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No questions yet. Add one to start building this activity.
          </p>
        )}

        {form.questions.map((question, qi) => {
          const qPrefix = `questions.${qi}`;
          return (
            <Card key={question.key} size="sm">
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle>Question {qi + 1}</CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move question ${qi + 1} up`}
                    disabled={qi === 0 || busy}
                    onClick={() => updateQuestions((qs) => moveItem(qs, qi, -1))}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move question ${qi + 1} down`}
                    disabled={qi === form.questions.length - 1 || busy}
                    onClick={() => updateQuestions((qs) => moveItem(qs, qi, 1))}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove question ${qi + 1}`}
                    disabled={busy}
                    onClick={() => setRemoval({ kind: "question", qi })}
                  >
                    <Trash2 aria-hidden="true" className="text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`${qPrefix}-text`}>Question text</Label>
                  <Textarea
                    id={`${qPrefix}-text`}
                    value={question.questionText}
                    onChange={(e) => updateQuestion(qi, { questionText: e.target.value })}
                    maxLength={ACTIVITY_LIMITS.QUESTION_TEXT_MAX}
                    rows={2}
                    aria-invalid={Boolean(errors[`${qPrefix}.questionText`])}
                  />
                  {err(`${qPrefix}.questionText`)}
                </div>

                <div className="space-y-2 sm:w-40">
                  <Label htmlFor={`${qPrefix}-points`}>Points</Label>
                  <Input
                    id={`${qPrefix}-points`}
                    type="number"
                    inputMode="numeric"
                    min={ACTIVITY_LIMITS.POINTS_MIN}
                    max={ACTIVITY_LIMITS.POINTS_MAX}
                    value={question.points}
                    onChange={(e) => updateQuestion(qi, { points: e.target.value })}
                    aria-invalid={Boolean(errors[`${qPrefix}.points`])}
                  />
                  {err(`${qPrefix}.points`)}
                </div>

                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">
                    Answer choices — select the one correct answer
                  </legend>
                  {question.choices.map((choice, ci) => (
                    <div key={choice.key} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${question.key}`}
                        checked={choice.isCorrect}
                        onChange={() => markCorrect(qi, ci)}
                        aria-label={`Choice ${ci + 1} is the correct answer`}
                        className="size-4 shrink-0 accent-primary"
                        disabled={busy}
                      />
                      <Input
                        value={choice.choiceText}
                        maxLength={ACTIVITY_LIMITS.CHOICE_TEXT_MAX}
                        aria-label={`Choice ${ci + 1} text`}
                        placeholder={`Choice ${ci + 1}`}
                        onChange={(e) =>
                          updateChoices(qi, (cs) =>
                            cs.map((c, i) => (i === ci ? { ...c, choiceText: e.target.value } : c)),
                          )
                        }
                        aria-invalid={Boolean(errors[`${qPrefix}.choices.${ci}.choiceText`])}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move choice ${ci + 1} up`}
                        disabled={ci === 0 || busy}
                        onClick={() => updateChoices(qi, (cs) => moveItem(cs, ci, -1))}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move choice ${ci + 1} down`}
                        disabled={ci === question.choices.length - 1 || busy}
                        onClick={() => updateChoices(qi, (cs) => moveItem(cs, ci, 1))}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove choice ${ci + 1}`}
                        disabled={busy}
                        onClick={() => setRemoval({ kind: "choice", qi, ci })}
                      >
                        <Trash2 aria-hidden="true" className="text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {err(`${qPrefix}.choices`)}
                  {Object.keys(errors)
                    .filter((k) => k.startsWith(`${qPrefix}.choices.`) && k.endsWith(".choiceText"))
                    .map((k) => (
                      <div key={k}>{err(k)}</div>
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateChoices(qi, (cs) => [...cs, blankChoice(false)])}
                    disabled={question.choices.length >= ACTIVITY_LIMITS.CHOICES_MAX || busy}
                  >
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Add choice
                  </Button>
                </fieldset>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <ConfirmDialog
        open={removal !== null}
        onOpenChange={(open) => !open && setRemoval(null)}
        title={
          removal?.kind === "question"
            ? `Remove question ${removal.qi + 1}?`
            : `Remove choice ${removal ? removal.ci + 1 : ""}?`
        }
        description="It is removed from this form. Nothing changes in the database until you save the draft or publish."
        confirmLabel="Remove"
        onConfirm={confirmRemoval}
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur sm:p-4">
        <div className="mx-auto flex max-w-6xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link
            href={savedId === null ? "/activities" : `/activities/${savedId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Back
          </Link>
          <Button variant="outline" onClick={() => save("draft")} disabled={busy || noClassrooms}>
            {pending === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button className={CTA_CLASSES} onClick={() => save("publish")} disabled={busy || noClassrooms}>
            {pending === "publish" ? "Publishing…" : "Save and publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
