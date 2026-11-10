-- =============================================================================
-- CHECK constraints for rules Prisma's schema language cannot express.
-- Enforced by MySQL itself (8.0.16+, including 8.4), so they hold no matter
-- which code path writes the data.
--
-- This block is appended to the `init` migration by scripts/append-checks.mjs
-- (npm run db:init). Prisma ignores CHECK constraints when it compares the
-- database with schema.prisma, so they never cause migration drift.
-- =============================================================================

-- questions: "Points must be greater than zero." Position starts at 1.
ALTER TABLE `questions`
  ADD CONSTRAINT `chk_questions_points_positive`   CHECK (`points` > 0),
  ADD CONSTRAINT `chk_questions_position_positive` CHECK (`position` >= 1);

-- choices: display order starts at 1.
ALTER TABLE `choices`
  ADD CONSTRAINT `chk_choices_position_positive` CHECK (`position` >= 1);

-- submissions: only attempt 1 (normal) and attempt 2 (authorised retake).
ALTER TABLE `submissions`
  ADD CONSTRAINT `chk_submissions_attempt_number` CHECK (`attempt_number` IN (1, 2)),
  ADD CONSTRAINT `chk_submissions_score_nonneg`   CHECK (`score` >= 0);

-- submission_answers: a wrong or partial answer awards 0, never negative.
ALTER TABLE `submission_answers`
  ADD CONSTRAINT `chk_submission_answers_points_nonneg` CHECK (`awarded_points` >= 0);

-- activities: the DRAFT -> OPEN -> CLOSED lifecycle must be internally
-- consistent. A code is assigned exactly when an activity opens and is kept
-- (as a historical record) after it closes. Nothing can be reopened.
ALTER TABLE `activities`
  ADD CONSTRAINT `chk_activities_lifecycle` CHECK (
       (`status` = 'DRAFT'  AND `session_code` IS NULL     AND `opened_at` IS NULL     AND `closed_at` IS NULL)
    OR (`status` = 'OPEN'   AND `session_code` IS NOT NULL AND `opened_at` IS NOT NULL AND `closed_at` IS NULL)
    OR (`status` = 'CLOSED' AND `session_code` IS NOT NULL AND `opened_at` IS NOT NULL AND `closed_at` IS NOT NULL)
  );
