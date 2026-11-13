-- Phase 4 (Stage E): ADDITIVE ONLY. Lets an instructor release a participant's access
-- so the same student can rejoin with their name. History is kept.

-- AlterTable
ALTER TABLE `participants` ADD COLUMN `access_released_at` DATETIME(0) NULL;
