// Appends prisma/check-constraints.sql to the generated `init` migration.
//
// Why: Prisma's schema language cannot express CHECK constraints, and the
// documented way to add them is to edit the generated migration SQL BEFORE it
// is applied. `npm run db:init` runs:
//
//   1. prisma migrate dev --name init --create-only   (generate SQL, do not apply)
//   2. node scripts/append-checks.mjs                  (this script)
//   3. prisma migrate dev                              (apply, verify no drift)
//   4. prisma generate                                 (build the client)
//
// Safe to run twice: it does nothing if the block is already present.
// Do NOT run it after the init migration has been applied; Prisma would then
// report that the migration file was modified after being applied.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const migrationsDir = join(root, "prisma", "migrations");
const checksFile = join(root, "prisma", "check-constraints.sql");
const MARKER = "-- >>> CHECK CONSTRAINTS (appended by scripts/append-checks.mjs) >>>";

function fail(message) {
  console.error(`append-checks: ${message}`);
  process.exit(1);
}

if (!existsSync(checksFile)) fail(`missing ${checksFile}`);
if (!existsSync(migrationsDir)) {
  fail(`no ${migrationsDir}. Run "prisma migrate dev --name init --create-only" first.`);
}

const initFolders = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d+_init$/.test(entry.name))
  .map((entry) => entry.name);

if (initFolders.length === 0) {
  fail('no "<timestamp>_init" migration folder found.');
}
if (initFolders.length > 1) {
  fail(`expected exactly one init migration, found: ${initFolders.join(", ")}`);
}

const migrationFile = join(migrationsDir, initFolders[0], "migration.sql");
if (!existsSync(migrationFile)) fail(`missing ${migrationFile}`);

const current = readFileSync(migrationFile, "utf8");
if (current.includes(MARKER)) {
  console.log(`append-checks: already present in ${initFolders[0]}, nothing to do.`);
  process.exit(0);
}

if (!/CREATE TABLE `activities`/.test(current)) {
  fail("init migration does not look like the expected schema (no activities table).");
}

const checks = readFileSync(checksFile, "utf8").trim();
const separator = current.endsWith("\n") ? "\n" : "\n\n";
writeFileSync(migrationFile, `${current}${separator}${MARKER}\n${checks}\n`, "utf8");

console.log(`append-checks: added CHECK constraints to ${initFolders[0]}/migration.sql`);
