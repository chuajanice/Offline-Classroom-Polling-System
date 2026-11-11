-- CreateTable
CREATE TABLE `instructor_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instructor_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `instructor_sessions_token_hash_key`(`token_hash`),
    INDEX `instructor_sessions_instructor_id_idx`(`instructor_id`),
    INDEX `instructor_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `instructor_sessions` ADD CONSTRAINT `instructor_sessions_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
