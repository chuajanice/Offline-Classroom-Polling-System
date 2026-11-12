// Zod 4 request schemas for the Phase 3 classroom and activity APIs.
// Shape and length checks live here. Cross-field rules (schedule order,
// publish readiness) live in activity-rules.ts so they are unit-tested.
import { z } from "zod";
import { AppError } from "./errors";
import { ACTIVITY_LIMITS } from "./activity-rules";

/** Trims, enforces a maximum length, and rejects empty text when `label` is required. */
function boundedText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((s) => s.trim());
}

function requiredText(max: number, label: string) {
  return boundedText(max, label).pipe(z.string().min(1, `${label} is required.`));
}

/** Empty or missing becomes null; otherwise trimmed. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label} must be at most ${max} characters.`)
    .nullish()
    .transform((s) => {
      const trimmed = s?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });
}

// ---- classrooms ------------------------------------------------------------

export const classroomInputSchema = z.object({
  classroomName: requiredText(120, "Classroom name"),
  description: optionalText(255, "Description"),
});

export const classroomUpdateSchema = z
  .object({
    classroomName: requiredText(120, "Classroom name").optional(),
    description: optionalText(255, "Description").optional(),
  })
  .refine((data) => data.classroomName !== undefined || data.description !== undefined, {
    message: "Nothing to update.",
  });

export type ClassroomInput = z.output<typeof classroomInputSchema>;
export type ClassroomUpdate = z.output<typeof classroomUpdateSchema>;

// ---- activities ------------------------------------------------------------

const choiceSchema = z.object({
  choiceText: boundedText(ACTIVITY_LIMITS.CHOICE_TEXT_MAX, "Choice text"),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  questionText: boundedText(ACTIVITY_LIMITS.QUESTION_TEXT_MAX, "Question text"),
  points: z
    .number()
    .int("Points must be a whole number.")
    .min(ACTIVITY_LIMITS.POINTS_MIN, `Points must be at least ${ACTIVITY_LIMITS.POINTS_MIN}.`)
    .max(ACTIVITY_LIMITS.POINTS_MAX, `Points must be at most ${ACTIVITY_LIMITS.POINTS_MAX}.`),
  choices: z
    .array(choiceSchema)
    .max(ACTIVITY_LIMITS.CHOICES_MAX, `A question can have at most ${ACTIVITY_LIMITS.CHOICES_MAX} choices.`),
});

/**
 * Accepts drafts (incomplete questions allowed) and is the base for publishing.
 * Empty question or choice text is allowed here on purpose: publishing checks it.
 */
export const activityInputSchema = z.object({
  classroomId: z.number().int().positive("Choose a classroom."),
  title: requiredText(ACTIVITY_LIMITS.TITLE_MAX, "Title"),
  instructions: optionalText(ACTIVITY_LIMITS.INSTRUCTIONS_MAX, "Instructions"),
  opensAt: z.iso.datetime({ error: "Enter a valid opening time." }).nullish(),
  closesAt: z.iso.datetime({ error: "Enter a valid closing time." }).nullish(),
  durationMinutes: z
    .number()
    .int("Duration must be a whole number of minutes.")
    .min(1, "Duration must be at least 1 minute.")
    .max(ACTIVITY_LIMITS.DURATION_MAX_MINUTES, "Duration is too long.")
    .nullish(),
  maxAttempts: z.union([z.literal(1), z.literal(2)], { error: "Attempts must be 1 or 2." }),
  questions: z
    .array(questionSchema)
    .max(ACTIVITY_LIMITS.QUESTIONS_MAX, `An activity can have at most ${ACTIVITY_LIMITS.QUESTIONS_MAX} questions.`),
});

export type ActivityInput = z.output<typeof activityInputSchema>;

// ---- parsing helpers -------------------------------------------------------

/** Positive integer id from a URL segment, or null. Never throws. */
export function toPositiveId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  return Number(raw);
}

/** Like toPositiveId, but throws a 404 for API routes. */
export function parseIdParam(raw: string): number {
  const id = toPositiveId(raw);
  if (id === null) throw new AppError(404, "NOT_FOUND", "We could not find that item.");
  return id;
}

/**
 * Validates an untrusted body. Failures throw AppError(400) with field keys
 * that include nested paths, e.g. "questions.2.choices".
 */
export function parseDottedOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data as z.output<S>;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    if (!(key in fields)) fields[key] = issue.message;
  }
  throw new AppError(400, "VALIDATION_ERROR", "Please correct the highlighted fields.", { fields });
}
