# Stage B: Student ID Requirement

This stage makes a **student ID required** when joining an activity, and stops the same student from joining one activity twice under a different spelling of their name.

It is additive. No tables are created, dropped, or renamed. Existing participants are kept, and their ID stays empty because no IDs are invented for old records.

---

## 1. What changed

| Area | Change |
|---|---|
| Database | `participants` gets two nullable columns: `student_id` and `normalized_student_id`. A unique index on `(activity_id, normalized_student_id)` prevents duplicate joins. |
| Join rules | Student ID is required and checked on the server. The normalized ID is compared, so `ab-12`, `AB-12`, and ` AB - 12 ` count as the same student. Leading zeroes are kept. |
| Duplicate handling | Same ID in the same activity: rejected with `STUDENT_ID_TAKEN`. Same ID in a different activity: allowed. |
| Name rule | Unchanged. Two students with the same name still cannot join the same activity (see Known limits). |
| Instructor results | New **Student ID** column in the participant table. Historical participants show `—`. |
| Join form | New **Student ID** field between Session code and Full name. |
| Tests | Existing join tests now pass IDs. New integration and unit tests cover the ID rules. |

### Files

- `prisma/schema.prisma`: two columns and one unique index on `Participant`
- `prisma/migrations/20261117090000_add_participant_student_id/migration.sql` (new)
- `src/lib/student-id.ts` (new): validation and normalization
- `src/lib/builder-validation.ts`: `studentId` added to the join schema
- `src/services/student.service.ts`: join logic
- `src/services/results.service.ts`: `studentId` in the results DTO
- `src/components/student/join-form.tsx`: new input field
- `src/components/results/participant-table.tsx`: new column
- `tests/phase4-participation.test.ts`, `tests/phase4-results.test.ts`, `tests/phase4-scoring.test.ts`: updated join calls and new ID tests
- `tests/unit/student-id.test.ts` (new)

---

## 2. Rules for a student ID

- Required. Empty input is rejected with "Enter your student ID."
- 3 to 30 characters after removing spaces.
- Letters, digits, and hyphens only. Must start with a letter or digit.
- Full-width digits are converted to normal digits (e.g. `２０２４` becomes `2024`).
- Stored as typed (display form). Compared in upper case (normalized form).

---

## 3. Before you start

You need:

- Node.js and npm (the project was built with the versions in `package.json`)
- A running MySQL 8 server and a valid `.env` (copy from `.env.example`)
- A backup of your database if it contains real classroom data

Make a database backup first:

```bash
mysqldump -u <user> -p offline_polling_db > backup-before-stage-B.sql
```

---

## 4. Step-by-step application

### Step 1: Get the code

Either unzip the delivered `Offline-Classroom-Polling-System-janice-stageB.zip`, or apply the patch to a clean copy of the `janice` branch:

```bash
git checkout janice
git apply stage-B-student-id.patch
```

If `git apply` reports a conflict, do not force it. Compare the affected files manually (listed in section 1).

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Regenerate the Prisma client

The schema changed, so the generated client must be rebuilt. Without this step TypeScript will report `studentId` as missing from the Participant type.

```bash
npm run db:generate
```

### Step 4: Validate the schema

```bash
npm run db:validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

### Step 5: Apply the migration

**Development database:**

```bash
npm run db:migrate
```

This applies `20261117090000_add_participant_student_id` and regenerates the client.

**Production or shared database** (applies pending migrations without creating new ones):

```bash
npx prisma migrate deploy
npm run db:generate
```

Check the status afterwards:

```bash
npm run db:status
```

Expected: all migrations applied, none pending.

### Step 6: Check the database

In MySQL:

```sql
SHOW COLUMNS FROM participants LIKE '%student_id%';
SHOW INDEX FROM participants WHERE Key_name = 'participants_activity_id_normalized_student_id_key';
```

You should see both new columns (nullable) and the unique index. Existing rows will have `NULL` in both columns, which is correct.

### Step 7: Run the tests

```bash
npm run test:unit
npm test
```

- `test:unit` covers the pure ID rules and does not need a database.
- `npm test` includes the database tests. These need the database from Step 5.

Also run:

```bash
npm run lint
npm run build
```

### Step 8: Start the app and check it by hand

```bash
npm run dev
```

Then follow the manual checks in section 5.

---

## 5. Manual checks

1. **Required field.** Open the join page, leave Student ID empty, and submit. The field should show "Enter your student ID." and no request should succeed.
2. **Valid join.** Join with a session code, an ID such as `2024-00123`, and a name. You should land on the activity page.
3. **Duplicate ID, different name.** Join the same activity with the same ID but a different spelling of the name (e.g. `Anna Cruz` after `Ana Cruz`). The app should say the student ID has already joined.
4. **Case and spaces.** Try `2024-00123` typed as `2024 - 00123`, or `ab-12` vs `AB-12`. Both should count as duplicates.
5. **Leading zeroes.** Join with `00123`. The instructor's table should show `00123`, not `123`.
6. **Same ID, another activity.** Open a second activity, join with the same ID. It should be accepted.
7. **Instructor results.** Open the activity's results page. The Student ID column should show the IDs entered, and `—` for any old participants.
8. **Released access.** As the instructor, release access for a student. The student can rejoin with the same ID and keeps their earlier submissions.
9. **Historical participants.** Confirm that participants created before this stage still appear in results and with their scores.

---

## 6. Rollback

If something goes wrong, restore the backup:

```bash
mysql -u <user> -p offline_polling_db < backup-before-stage-B.sql
```

Or remove the migration's changes manually:

```sql
ALTER TABLE participants DROP INDEX participants_activity_id_normalized_student_id_key;
ALTER TABLE participants DROP COLUMN normalized_student_id, DROP COLUMN student_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20261117090000_add_participant_student_id';
```

Then revert the code with `git checkout -- .` or by reapplying the previous commit.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Property 'studentId' does not exist` in TypeScript | Client not regenerated. Run `npm run db:generate`. |
| `Cannot find module 'zod'` or `@prisma/adapter-mariadb` in unit tests | Dependencies not installed. Run `npm install`. |
| Migration fails on `CREATE UNIQUE INDEX` | Two participants in one activity already share a normalized ID. This should not happen for this stage, since IDs are new. Check with `SELECT activity_id, normalized_student_id, COUNT(*) FROM participants WHERE normalized_student_id IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1;` |
| Join returns `VALIDATION_ERROR` with `studentId` | The ID failed the rules in section 2. |
| Join returns `NAME_TAKEN` for a new student | Another student in the same activity already has that exact name (see Known limits). |

---

## 8. Known limits

- **Identical names.** Two different students with the same full name still cannot join the same activity. This is the existing name rule, kept on purpose. The team needs to decide whether to relax it now that IDs identify students.
- **ID format is a proposal.** The 3 to 30 character, letters-digits-hyphens rule is an assumption. Change `src/lib/student-id.ts` if your institution uses another format.
- **Historical reclaim.** A released participant from before this stage can rejoin with their name. The ID entered is then recorded on that record.
- **Not verified in this environment.** The database tests and `npm run build` were not run in the environment where this was prepared. Run Step 7 before relying on this stage.
- **No protection against ID sharing.** The ID is not a password. Anyone who knows a student's ID and name can take over a released spot, as before with names alone.
