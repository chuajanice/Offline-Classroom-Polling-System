# Stage 3: Exit Warning and Automatic Zero

This stage protects an active activity from students leaving it mid-answer. When a student leaves the page (switches tab, hides the page, or presses browser back), they see a confirmation. Choosing YES, or leaving a second time after choosing NO, gives the attempt an automatic score of zero.

It requires **Stage B** (Student ID) to be applied first.

It is additive. No tables are created, dropped, or renamed. One table, `attempt_starts`, gets three columns, and each attempt keeps its own warning state.

---

## 1. Behaviour

| Event | Result |
|---|---|
| First detected leave | Warning dialog appears when the student is back on the page. Nothing is submitted. |
| Repeated leave events while the dialog is pending | Ignored. One hide can fire several browser events. |
| NO – Stay in Activity | Student continues answering. The choice is saved on the server, so a reload keeps it. |
| YES – Leave and Submit Zero | Attempt is scored zero and ends at once. |
| Leave again after NO | Attempt is scored zero. No dialog is shown. |
| Any event after the attempt is zeroed | Ignored. The attempt is never zeroed twice. |
| Authorised retake | Attempt 2 starts with a clean warning state. |
| Normal submission | Unaffected. Once submitted, later exit events do nothing. |

Scores come only from the server. The browser never sends a score.

---

## 2. What is detected

- Switching to another browser tab (`visibilitychange`, hidden state)
- Closing the tab, refreshing, or navigating away (`pagehide`). Reports use `keepalive` so they can still be sent while the page is going away.
- Browser back button. The page adds one history entry, so back keeps the student on the page and records the event.

**Limits.** Browsers cannot reliably report a device shutdown, a crashed browser, or a lost network connection. A student who leaves and never returns to the page will not see the dialog, and the attempt is not zeroed automatically. The instructor's results show these attempts as they are, so the instructor should check any unfinished attempts. This is a browser limit, not something the app can fully prevent.

---

## 3. Files

**New**
- `prisma/migrations/20261118090000_add_exit_warning/migration.sql`
- `src/lib/exit-rules.ts`: pure decision rules
- `src/app/api/student/activities/[id]/exit-events/route.ts`: `POST` endpoint
- `tests/unit/exit-rules.test.ts`
- `tests/phase7-exit-warning.test.ts`

**Changed**
- `prisma/schema.prisma`: three fields on `AttemptStart`
- `src/lib/builder-validation.ts`: exit event schema
- `src/services/student.service.ts`: `recordExitEvent`, automatic zero, two new fields in the student view
- `src/components/student/student-activity.tsx`: detection, back-button guard, warning dialog, zeroed-attempt notice

---

## 4. Before you start

- Stage B is applied and working.
- A database backup:

```bash
mysqldump -u <user> -p offline_polling_db > backup-before-stage-3.sql
```

---

## 5. Step-by-step application

### Step 1: Apply the patch

From the Stage B state:

```bash
git apply stage-3-exit-warning.patch
```

If `git apply` reports a conflict, do not force it. The changed files are listed in section 3.

### Step 2: Install dependencies (if not already installed)

```bash
npm install
```

### Step 3: Regenerate the Prisma client

```bash
npm run db:generate
```

### Step 4: Validate the schema

```bash
npm run db:validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

### Step 5: Apply the migration

Development:

```bash
npm run db:migrate
```

Production or shared database:

```bash
npx prisma migrate deploy
npm run db:generate
```

Check the status:

```bash
npm run db:status
```

Expected: all migrations applied.

### Step 6: Check the database

```sql
SHOW COLUMNS FROM attempt_starts LIKE 'exit_%';
```

You should see `exit_stage` (default 0), `exit_warned_at` (nullable), and `exit_decision` (nullable). Existing rows have `exit_stage = 0`.

### Step 7: Run the tests

Unit tests (no database needed):

```bash
npm run test:unit
```

Database tests:

```bash
npm test
```

Also run:

```bash
npm run lint
npm run build
```

### Step 8: Start the app and check by hand

```bash
npm run dev
```

Follow the manual checks in section 6.

---

## 6. Manual checks

Use two browser windows: one as the instructor (to open the activity) and one as the student (to join and answer).

1. **Switch tab.** Start answering as a student, switch to another tab, and come back. The warning dialog should be visible with both buttons.
2. **NO.** Choose NO – Stay in Activity. You should still be able to answer and submit normally. Refresh the page. The dialog should not return.
3. **Leave after NO.** Switch tab again after choosing NO. Come back. There should be no dialog. The attempt should show a zero score in "Your results", with the notice "Attempt 1 was scored zero because you left the activity during it."
4. **YES.** On a new student, switch tab, come back, and choose YES – Leave and Submit Zero. The attempt should show zero at once.
5. **Browser back.** Start answering and press the browser's back button. The page should stay open, and the warning should appear.
6. **Refresh.** After the first warning, refresh the page without answering. The dialog should still be shown, because the warning is stored on the server.
7. **Normal submission.** Answer and submit before leaving. No warning should appear afterwards, and the score should be the real score.
8. **Retake.** In an activity with 2 attempts, let a student be zeroed on attempt 1. The instructor authorises a retake. Attempt 2 should start with no warning, and its own leave events should be counted separately.
9. **Instructor results.** The participant's zeroed attempt should show a score of 0 with the attempt's time.

---

## 7. Rollback

Restore the backup:

```bash
mysql -u <user> -p offline_polling_db < backup-before-stage-3.sql
```

Or remove the columns manually:

```sql
ALTER TABLE attempt_starts DROP CHECK chk_attempt_starts_exit_stage;
ALTER TABLE attempt_starts DROP CHECK chk_attempt_starts_exit_decision;
ALTER TABLE attempt_starts DROP COLUMN exit_decision, DROP COLUMN exit_warned_at, DROP COLUMN exit_stage;
DELETE FROM _prisma_migrations WHERE migration_name = '20261118090000_add_exit_warning';
```

Then revert the code, for example with `git checkout` to the Stage B commit.

---

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Property 'exitStage' does not exist` in TypeScript | Client not regenerated. Run `npm run db:generate`. |
| Warning appears on every page load | `exit_decision` is not being saved. Check the `exit-events` request returns 201 and that the database column exists. |
| Warning never appears when switching tabs | Check the browser console for a failed request to `/exit-events`, and confirm you are logged in as the student for that activity. |
| `401 UNAUTHENTICATED` on exit events | The student's activity cookie is missing or the access was released. This is expected after an instructor releases access. |
| Back button does nothing | The guard runs only while the attempt is ready. It does nothing after the attempt is submitted or zeroed. |

---

## 9. Known limits

- **Browser detection is partial.** Device shutdown, a crashed browser, and network loss cannot be reported. See section 2.
- **Unanswered dialogs do not zero.** If a student is warned and never returns, the attempt stays unscored until the instructor reviews it.
- **Back-button history entry.** The page adds one history entry on load. This is what lets back be intercepted. It has no other effect.
- **Instructions page not changed.** Stage 9 covers the student instructions before answering. The timer still starts on the first load of the questions, as before.
- **Not verified in the environment where this was prepared.** The database tests, `npm run build`, and the browser checks in section 6 were not run there. Run them before relying on this stage.
