-- CreateTable
CREATE TABLE `instructors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `full_name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `instructors_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classrooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instructor_id` INTEGER NOT NULL,
    `classroom_name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `archived_at` DATETIME(0) NULL,

    INDEX `classrooms_instructor_id_archived_at_idx`(`instructor_id`, `archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `classroom_id` INTEGER NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `instructions` TEXT NULL,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `session_code` VARCHAR(12) NULL,
    `opened_at` DATETIME(0) NULL,
    `closed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `activities_session_code_key`(`session_code`),
    INDEX `activities_classroom_id_status_idx`(`classroom_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activity_id` INTEGER NOT NULL,
    `question_text` TEXT NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 1,
    `position` INTEGER NOT NULL,

    UNIQUE INDEX `questions_activity_id_position_key`(`activity_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `choices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `question_id` INTEGER NOT NULL,
    `choice_text` VARCHAR(500) NOT NULL,
    `is_correct` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL,

    UNIQUE INDEX `choices_question_id_position_key`(`question_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activity_id` INTEGER NOT NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `normalized_name` VARCHAR(120) NOT NULL,
    `session_token_hash` CHAR(64) NOT NULL,
    `joined_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `participants_session_token_hash_key`(`session_token_hash`),
    UNIQUE INDEX `participants_activity_id_normalized_name_key`(`activity_id`, `normalized_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `participant_id` INTEGER NOT NULL,
    `attempt_number` INTEGER NOT NULL,
    `score` DECIMAL(8, 2) NOT NULL,
    `submitted_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `submissions_participant_id_attempt_number_key`(`participant_id`, `attempt_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submission_answers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `submission_id` INTEGER NOT NULL,
    `question_id` INTEGER NOT NULL,
    `selected_choice_id` INTEGER NOT NULL,
    `is_correct` BOOLEAN NOT NULL,
    `awarded_points` DECIMAL(8, 2) NOT NULL,

    INDEX `submission_answers_question_id_idx`(`question_id`),
    INDEX `submission_answers_selected_choice_id_idx`(`selected_choice_id`),
    UNIQUE INDEX `submission_answers_submission_id_question_id_key`(`submission_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retake_authorizations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `participant_id` INTEGER NOT NULL,
    `authorized_by` INTEGER NOT NULL,
    `authorized_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `used_at` DATETIME(0) NULL,

    UNIQUE INDEX `retake_authorizations_participant_id_key`(`participant_id`),
    INDEX `retake_authorizations_authorized_by_idx`(`authorized_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_classroom_id_fkey` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `choices` ADD CONSTRAINT `choices_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `participants` ADD CONSTRAINT `participants_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_answers` ADD CONSTRAINT `submission_answers_submission_id_fkey` FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_answers` ADD CONSTRAINT `submission_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_answers` ADD CONSTRAINT `submission_answers_selected_choice_id_fkey` FOREIGN KEY (`selected_choice_id`) REFERENCES `choices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retake_authorizations` ADD CONSTRAINT `retake_authorizations_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retake_authorizations` ADD CONSTRAINT `retake_authorizations_authorized_by_fkey` FOREIGN KEY (`authorized_by`) REFERENCES `instructors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- >>> CHECK CONSTRAINTS (appended by scripts/append-checks.mjs) >>>
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
