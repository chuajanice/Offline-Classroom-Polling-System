-- Phase 3: Activity Builder. ADDITIVE ONLY: no existing rows, columns, tables
-- or constraints are changed or removed.

-- AlterTable
ALTER TABLE `activities`
    ADD COLUMN `duration_minutes` INTEGER NULL,
    ADD COLUMN `max_attempts` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `published_at` DATETIME(0) NULL,
    ADD COLUMN `scheduled_closes_at` DATETIME(0) NULL,
    ADD COLUMN `scheduled_opens_at` DATETIME(0) NULL,
    ADD COLUMN `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- CHECK constraints (Prisma's schema language cannot express these; MySQL 8.0.16+ enforces them).
ALTER TABLE `activities`
    ADD CONSTRAINT `chk_activities_max_attempts` CHECK (`max_attempts` IN (1, 2)),
    ADD CONSTRAINT `chk_activities_duration_positive` CHECK (`duration_minutes` IS NULL OR `duration_minutes` > 0),
    ADD CONSTRAINT `chk_activities_schedule_order` CHECK (
         `scheduled_opens_at` IS NULL
      OR `scheduled_closes_at` IS NULL
      OR `scheduled_closes_at` > `scheduled_opens_at`
    );
