-- Phase 4 (Stage A): ADDITIVE ONLY. Nothing existing is removed or rewritten.

-- AlterTable: archive support for activities
ALTER TABLE `activities` ADD COLUMN `archived_at` DATETIME(0) NULL;

-- CreateTable: attempt start times for the optional time limit
CREATE TABLE `attempt_starts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `participant_id` INTEGER NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `started_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `attempt_starts_participant_id_attempt_number_key`(`participant_id`, `attempt_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attempt_starts` ADD CONSTRAINT `attempt_starts_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (not expressible in Prisma's schema language)
ALTER TABLE `attempt_starts`
    ADD CONSTRAINT `chk_attempt_starts_attempt_number` CHECK (`attempt_number` IN (1, 2));

-- An archived activity can never be OPEN. Archiving closes an open activity first.
ALTER TABLE `activities`
    ADD CONSTRAINT `chk_activities_archived_not_open` CHECK (`archived_at` IS NULL OR `status` <> 'OPEN');
