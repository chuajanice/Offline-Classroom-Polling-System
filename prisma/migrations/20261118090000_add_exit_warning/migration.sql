-- Stage 3 (exit warning): ADDITIVE ONLY, per attempt. Existing attempts start at stage 0.

-- AlterTable
ALTER TABLE `attempt_starts`
    ADD COLUMN `exit_stage` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `exit_warned_at` DATETIME(0) NULL,
    ADD COLUMN `exit_decision` VARCHAR(10) NULL;

-- CHECK constraints (not expressible in Prisma's schema language)
ALTER TABLE `attempt_starts`
    ADD CONSTRAINT `chk_attempt_starts_exit_stage` CHECK (`exit_stage` IN (0, 1, 2));
ALTER TABLE `attempt_starts`
    ADD CONSTRAINT `chk_attempt_starts_exit_decision` CHECK (`exit_decision` IS NULL OR `exit_decision` = 'STAY');
