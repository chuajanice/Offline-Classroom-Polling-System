// Plain, serialisable shapes returned by the Phase 3 services and API routes.
// Types only: safe to import from client components.

export type ClassroomDto = {
  id: number;
  classroomName: string;
  description: string | null;
  createdAt: string;
  archivedAt: string | null;
  activityCount: number;
};

export type ActivityStatusDto = "DRAFT" | "OPEN" | "CLOSED";

export type ActivitySummaryDto = {
  id: number;
  classroomId: number;
  classroomName: string;
  title: string;
  status: ActivityStatusDto;
  /** false = draft. Publishing never changes `status` in Phase 3. */
  isPublished: boolean;
  publishedAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  maxAttempts: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ChoiceDto = {
  id: number;
  choiceText: string;
  /** Instructor-only. Student-facing endpoints must never return this field. */
  isCorrect: boolean;
  position: number;
};

export type QuestionDto = {
  id: number;
  questionText: string;
  points: number;
  position: number;
  choices: ChoiceDto[];
};

export type ActivityDetailDto = ActivitySummaryDto & {
  instructions: string | null;
  participantCount: number;
  questions: QuestionDto[];
};
