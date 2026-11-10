-- =============================================================================
-- One-time MySQL 8.4 setup for the Offline Classroom Polling System.
-- Run as an administrator, e.g.:   mysql -u root -p < scripts/mysql-setup.sql
--
-- BEFORE RUNNING: replace CHANGE_ME_strong_password below with a real password
-- (use the same one in .env, percent-encoded if it has special characters).
-- =============================================================================

-- Main database: utf8mb4 so any student name / punctuation / emoji is stored
-- correctly. The default utf8mb4_0900_ai_ci collation compares case- and
-- accent-insensitively (so "Jose" and "JOSÉ" are treated as the same name).
CREATE DATABASE IF NOT EXISTS `offline_polling_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Shadow database used by `prisma migrate dev` (wiped on every run).
CREATE DATABASE IF NOT EXISTS `offline_polling_shadow`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Application account (not root). It only reaches the two databases above.
CREATE USER IF NOT EXISTS 'polling_app'@'localhost'
  IDENTIFIED BY 'sjjm@ctuG!26';

GRANT ALL PRIVILEGES ON `offline_polling_db`.*     TO 'polling_app'@'localhost';
GRANT ALL PRIVILEGES ON `offline_polling_shadow`.* TO 'polling_app'@'localhost';

-- Sanity check: should list both databases for polling_app.
SHOW GRANTS FOR 'polling_app'@'localhost';
