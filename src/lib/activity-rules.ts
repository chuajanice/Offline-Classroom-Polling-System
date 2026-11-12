// Pure business rules for activities. No database and no framework imports,
// so every rule here can be unit-tested directly.

export const ACTIVITY_LIMITS = {
  TITLE_MAX: 150,
  INSTRUCTIONS_MAX: 5000,
  QUESTION_TEXT_MAX: 1000,
  CHOICE_TEXT_MAX: 500,
  QUESTIONS_MAX: 100,
  CHOICES_MAX: 6,
  CHOICES_MIN_TO_PUBLISH: 2,
  POINTS_MIN: 1,
  POINTS_MAX: 100,
  DURATION_MAX_MINUTES: 1440,
} as const;

/** Field key -> message. Nested keys use dots, e.g. "questions.0.choices.1.choiceText". */
export type FieldErrors = Record<string, string>;

export type RuleChoice = { choiceText: string; isCorrect: boolean };
export type RuleQuestion = { questionText: string; points: number; choices: RuleChoice[] };

/**
 * Schedule rules that apply to drafts AND published activities: the closing
 * time must be after the opening time, and an optional duration must fit
 * inside the open window.
 */
export function validateSchedule(
  opensAt: Date | null,
  closesAt: Date | null,
  durationMinutes: number | null,
): FieldErrors {
  const errors: FieldErrors = {};

  if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime()) {
    errors.closesAt = "The closing time must be later than the opening time.";
  }

  if (durationMinutes !== null) {
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > ACTIVITY_LIMITS.DURATION_MAX_MINUTES
    ) {
      errors.durationMinutes = `The duration must be a whole number of minutes from 1 to ${ACTIVITY_LIMITS.DURATION_MAX_MINUTES}.`;
    } else if (opensAt && closesAt && closesAt.getTime() > opensAt.getTime()) {
      const windowMinutes = (closesAt.getTime() - opensAt.getTime()) / 60_000;
      if (durationMinutes > windowMinutes) {
        errors.durationMinutes =
          "The duration cannot be longer than the time between opening and closing.";
      }
    }
  }

  return errors;
}

/**
 * Everything that must be true before an activity may be published.
 * `now` is the server's clock; the browser's clock is never trusted.
 */
export function publishProblems(args: {
  title: string;
  classroomArchived: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  durationMinutes: number | null;
  questions: RuleQuestion[];
  now: Date;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!args.title.trim()) errors.title = "Enter a title before publishing.";
  if (args.classroomArchived) {
    errors.classroomId = "This classroom is archived. Move the activity to an active classroom.";
  }

  if (!args.opensAt) errors.opensAt = "Choose when the activity opens.";
  if (!args.closesAt) {
    errors.closesAt = "Choose when the activity closes.";
  } else if (args.closesAt.getTime() <= args.now.getTime()) {
    errors.closesAt = "The closing time must be in the future.";
  }

  for (const [key, message] of Object.entries(
    validateSchedule(args.opensAt, args.closesAt, args.durationMinutes),
  )) {
    if (!(key in errors)) errors[key] = message;
  }

  if (args.questions.length === 0) {
    errors.questions = "Add at least one question.";
  }

  args.questions.forEach((question, qi) => {
    const base = `questions.${qi}`;

    if (!question.questionText.trim()) {
      errors[`${base}.questionText`] = "Enter the question text.";
    }

    if (
      !Number.isInteger(question.points) ||
      question.points < ACTIVITY_LIMITS.POINTS_MIN ||
      question.points > ACTIVITY_LIMITS.POINTS_MAX
    ) {
      errors[`${base}.points`] =
        `Points must be a whole number from ${ACTIVITY_LIMITS.POINTS_MIN} to ${ACTIVITY_LIMITS.POINTS_MAX}.`;
    }

    const choicesKey = `${base}.choices`;
    if (question.choices.length < ACTIVITY_LIMITS.CHOICES_MIN_TO_PUBLISH) {
      errors[choicesKey] =
        `Add at least ${ACTIVITY_LIMITS.CHOICES_MIN_TO_PUBLISH} answer choices.`;
    } else if (question.choices.filter((c) => c.isCorrect).length !== 1) {
      errors[choicesKey] = "Mark exactly one choice as the correct answer.";
    }

    question.choices.forEach((choice, ci) => {
      if (!choice.choiceText.trim()) {
        errors[`${choicesKey}.${ci}.choiceText`] = "Enter the choice text.";
      }
    });
  });

  return errors;
}
