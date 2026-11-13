-- Phase 5: ADDITIVE, with a backfill. Nothing existing is removed or rewritten.
-- Each submission stores the maximum score it was marked against, so historical
-- percentages never change even if the activity's questions were edited later.

-- 1. Add the column (nullable while it is backfilled)
ALTER TABLE `submissions` ADD COLUMN `max_score` DECIMAL(8, 2) NULL;

-- 2. Backfill from the questions that belonged to the activity. Questions are frozen
--    once an activity opens (Phase 4 rule), so the current sum equals the sum at submission time.
UPDATE `submissions` AS s
JOIN `participants` AS p ON p.`id` = s.`participant_id`
SET s.`max_score` = (
    SELECT COALESCE(SUM(q.`points`), 0) FROM `questions` AS q WHERE q.`activity_id` = p.`activity_id`
);

-- 3. Make it mandatory and sanity-check it
ALTER TABLE `submissions` MODIFY COLUMN `max_score` DECIMAL(8, 2) NOT NULL;
ALTER TABLE `submissions`
    ADD CONSTRAINT `chk_submissions_max_score_positive` CHECK (`max_score` > 0),
    ADD CONSTRAINT `chk_submissions_score_within_max` CHECK (`score` >= 0 AND `score` <= `max_score`);
