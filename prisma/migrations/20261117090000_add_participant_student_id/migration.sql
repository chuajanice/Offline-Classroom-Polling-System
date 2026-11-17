-- Student ID requirement (additive only). Nothing existing is removed or rewritten.
-- Historical participants keep NULL: no IDs are fabricated for old records.
-- MySQL allows many NULLs in a UNIQUE index, so historical rows never collide.

-- AlterTable
ALTER TABLE `participants`
    ADD COLUMN `student_id` VARCHAR(40) NULL,
    ADD COLUMN `normalized_student_id` VARCHAR(40) NULL;

-- CreateIndex: one normalized student ID per activity
CREATE UNIQUE INDEX `participants_activity_id_normalized_student_id_key`
    ON `participants`(`activity_id`, `normalized_student_id`);
