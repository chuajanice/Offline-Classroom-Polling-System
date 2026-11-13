# README-PHASE5: Results and PDF Reports

This guide applies Phase 5 to your existing Phase 4 project and explains how to verify it. It is written for Windows 11 and PowerShell.

Phase 5 adds:

- An instructor results dashboard showing activity and classroom details, totals, each participant's status, attempts 1 and 2 side by side, the current result, and submission times.
- A downloadable PDF report for each activity, built with pdf-lib from the stored database records.
- Stored maximum scores, so historical percentages never change after the fact.
- A participants endpoint, as listed in the master prompt.

Nothing from Phases 1 to 4 is removed or changed in behaviour. The student side is unchanged.

---

## 1. What changed, in brief

| Area | Change |
|---|---|
| Database | One additive migration: `submissions.max_score`, backfilled from each activity's questions, plus two CHECK constraints. |
| Scoring | Each new submission stores the maximum it was marked against. The dashboard, PDF and student view all read that stored value. |
| Results | `current result` (latest accepted attempt), `submission status`, and separate attempt 1 and attempt 2 figures. |
| Reports | `GET /api/activities/[id]/report` returns a PDF attachment. |
| Participants | `GET /api/activities/[id]/participants` returns the participant list and summary. |
| Dashboard | Results page shows activity and classroom details, totals, averages, and a **Download PDF report** button. |
| Dependency | `pdf-lib` 1.17.1 is added to `package.json`. |

### 1.1 Definitions used throughout

- **Percentage** = score ÷ maximum score × 100, rounded to two decimal places. A maximum of zero gives 0%.
- **First-attempt average** = the average of attempt 1 percentages, over participants who submitted attempt 1.
- **Current-result average** = the average of each participant's current result, over participants who have one.
- **Current result** = the latest accepted attempt. Attempt 2 supersedes attempt 1 once it is submitted. Both attempts are kept in the history.
- **Maximum score** = the sum of question points at the time the attempt was submitted. It is stored with the submission.

### 1.2 Why the maximum is now stored

Phases 1 to 4 computed the maximum from the activity's *current* questions. Questions cannot change after an activity opens, so the figures were correct, but nothing enforced that. Storing the maximum on each submission makes every historical percentage fixed, as the master prompt requires. The migration fills existing rows from the questions they were marked against.

### 1.3 Not included

- Reports for several activities at once, or for a whole classroom.
- Student-facing PDFs. The master prompt's requirement to exclude correct answers from student-facing reports is met by having no student-facing report at all.
- Charts. The master prompt asks for readable tables.
- Non-Latin characters in the PDF (see section 9).

---

## 2. Files

### 2.1 Database and dependencies

| File | Purpose |
|---|---|
| `prisma/migrations/20261113110000_add_phase5_submission_max_score/migration.sql` | Adds and backfills `submissions.max_score`, makes it required, and adds two CHECK constraints. |
| `prisma/schema.prisma` | Adds `Submission.maxScore`. Nothing else changes. |
| `package.json`, `package-lock.json` | Adds `pdf-lib` (`^1.17.1`). |
| `src/generated/prisma/` | Regenerated Prisma Client for the new field. |

### 2.2 Application code (new)

| File | Purpose |
|---|---|
| `src/lib/results-rules.ts` | Percentage, current result, and submission status rules. Pure, no database. |
| `src/lib/pdf.ts` | PDF layout and rendering with pdf-lib. |
| `src/services/report.service.ts` | Builds the report data and filename from the results service. |
| `src/app/api/activities/[id]/report/route.ts` | `GET` returns the PDF. |
| `src/app/api/activities/[id]/participants/route.ts` | `GET` returns participants and summary. |
| `src/app/(instructor)/activities/[id]/results/page.tsx` | Rewritten results dashboard. |
| `src/components/results/participant-table.tsx` | Rewritten table: attempts side by side, current result, status. |

### 2.3 Application code (changed)

| File | Change |
|---|---|
| `src/services/results.service.ts` | Reads stored maximum scores; adds current result, status, activity and classroom details, averages, and instructor name. Authorise-retake and release-access are unchanged. |
| `src/services/student.service.ts` | Stores `maxScore` on each submission; the student view reads the stored value. |
| `scripts/verify-phase1.ts` | Its raw test inserts now include `maxScore`, and it still checks the same constraints. |

### 2.4 Tests (new)

| File | Tests |
|---|---|
| `tests/unit/results-rules.test.ts` | 9 |
| `tests/unit/pdf-report.test.ts` | 12 |
| `tests/phase5-results.test.ts` | 10 |
| `tests/helpers/pdf-text.ts` | Helper that reads text back out of a PDF (not a test file). |

---

## 3. Setup

Work from your project folder (the one containing `package.json`). Your Phase 4 project should be working first.

### Step 1: Stop the development server

Press Ctrl+C in the window running `npm run dev` or `npm run start`.

### Step 2: Back up

```powershell
cd ..
Copy-Item -Recurse "offline-classroom-polling" "offline-classroom-polling-BEFORE-PHASE5"
cd "offline-classroom-polling"
git add -A
git commit -m "Before Phase 5"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u polling_app -p offline_polling_db > "..\offline_polling_db-BEFORE-PHASE5.sql"
```

Adjust the MySQL path if it is installed somewhere else. `mysqldump` asks for the password.

### Step 3: Apply the overlay

Put `phase5-overlay.zip` in your Downloads folder, then run:

```powershell
Expand-Archive -Path "$HOME\Downloads\phase5-overlay.zip" -DestinationPath ".\phase5-overlay" -Force
robocopy ".\phase5-overlay" "." /E /IS /IT /NFL /NDL /NJH /NJS
Remove-Item -Recurse -Force ".\phase5-overlay"
```

Robocopy exit codes 0 to 7 mean success. Code 8 or higher is an error.

Check that the new files arrived:

```powershell
Test-Path -LiteralPath "prisma\migrations\20261113110000_add_phase5_submission_max_score\migration.sql"  # True
Test-Path -LiteralPath "src\lib\pdf.ts"                                                                  # True
Select-String -Path "package.json" -Pattern "pdf-lib"                                                    # one match
```

### Step 4: Install the new dependency

```powershell
npm ci
```

`npm ci` installs exactly what `package-lock.json` records, including `pdf-lib`. If it fails, run `npm install` instead and tell us the error.

### Step 5: Apply the database migration

```powershell
npx prisma validate
npx prisma migrate status
npx prisma migrate dev
npx prisma generate
```

`migrate status` should list one pending migration: `20261113110000_add_phase5_submission_max_score`.

`migrate dev` applies it. This is the only step that changes existing data: it fills `max_score` on every existing submission from its activity's questions. It does not change any score.

If `migrate dev` asks to reset the database, answer **no** and press Ctrl+C. Send us the output of `npx prisma migrate status`.

Verify the column and constraints:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u polling_app -p offline_polling_db -e "SHOW COLUMNS FROM submissions LIKE 'max_score'; SELECT id, score, max_score FROM submissions LIMIT 5;"
```

Each row should show a `max_score` of at least the score. If there are no submissions yet, the query returns no rows; that is fine.

### Step 6: Check the project

```powershell
npx tsc --noEmit
npm run lint
npm run test:unit
npx tsx --test tests/phase5-results.test.ts
npx tsx --test tests/phase4-lifecycle.test.ts tests/phase4-sessions.test.ts tests/phase4-participation.test.ts tests/phase4-scoring.test.ts tests/phase4-results.test.ts
npx tsx --test tests/phase3-activity.service.test.ts tests/phase3-builder-operations.test.ts tests/phase3-classroom.service.test.ts
npx tsx --test tests/auth.service.test.ts tests/validation.test.ts
npm run db:verify
```

Each test command should finish with `fail 0`. `db:verify` should end with `PHASE 1 READY`.

### Step 7: Build

```powershell
npm run build
```

Expected: `Compiled successfully`, and the route list includes `/api/activities/[id]/report` and `/api/activities/[id]/participants`.

The build downloads Google fonts, so it needs internet access, as it did in earlier phases.

---

## 4. Using the results and reports

### 4.1 Instructor

1. Open an activity, then click **Participants & results**.
2. The page shows the activity and classroom details, the instructor's name, the opened and closed times, and the totals.
3. The participant table lists each student's name and status, their attempt 1 and attempt 2 scores with percentages and submission times, and their current result.
4. Click **Download PDF report**. Your browser saves a file named like `results-quiz-1-networks-42.pdf`.

The page refreshes every 10 seconds while the session is open. The report reflects the database at the moment you download it.

### 4.2 What the PDF contains

- System title and report type.
- Instructor name, classroom name, activity title, and activity date (when it opened, or when it is scheduled to open).
- Opened and closed times, attempts allowed, question count, and maximum score.
- Totals: participants and submissions. Averages of first attempts and of current results.
- A table with one row per attempt: student name, status, attempt number (the current one is marked), score out of maximum, percentage, and submission time. A student with no submission has one row marked "Not submitted".
- Page numbers and the generation time on every page.

It does **not** contain question text, choice text, or which answer is correct.

---

## 5. Security

- Both new routes require the instructor's session. Anyone else gets `401`.
- Every query is scoped to the instructor's own activities. Another instructor gets `404`, which does not reveal whether the activity exists. This applies to the results page, the participants endpoint and the PDF.
- Archived activities keep their history, so their reports still work.
- No tokens, token hashes or student cookies appear in the results or the PDF.
- The PDF is sent as an attachment with `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- All figures come from the server. The browser never supplies a score or a maximum.

---

## 6. Verification performed

Everything below was run in a Linux sandbox with Node 22 and MySQL 8.0.46, on the same code. It was not run on your Windows computer, so run Steps 6 and 7 there.

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Passed |
| ESLint (app, components, lib, services, tests, scripts) | Passed, no warnings |
| Unit tests (Phases 1 to 5) | 74 existing + 21 new = 95 passed |
| Phase 2 auth and validation | 32 passed |
| Phase 3 integration | 37 passed |
| Phase 4 integration | 63 passed |
| Phase 5 integration | 10 passed |
| All tests together | 237 passed, 0 failed |
| Phase 1 database verification (`db:verify`) | 46 checks passed |
| Production build (`next build`) | Passed, new routes compiled |
| LAN run (server on `0.0.0.0`) | Passed (below) |

What the Phase 5 tests check:

- **Accuracy:** participant and submission counts; averages of first attempts and of current results; a participant with no submission is excluded from submission counts and averages.
- **Attempts:** one attempt, and two attempts with a retake. Attempts are kept separately, and the latest accepted attempt is the current result.
- **Percentages:** exact fractions (62.5%, 100%) and rounding to two decimals (66.67%); no division by zero.
- **Historical scores:** after a question's points are changed directly in the database, the stored maximum, percentage and score are unchanged. The database refuses a score above its stored maximum.
- **Archived activities:** results and the PDF still work after archiving, with submissions intact.
- **Ownership:** another instructor cannot read the results, the report, or a report for a non-existent activity.
- **PDF contents, read back from the document:** the required fields, every student name, attempt numbers, scores, percentages, "Not submitted", and the absence of question and answer text.
- **PDF layout:** a 120-row report paginates, with the header repeated on every page; an empty activity renders; unsupported characters are replaced without failing.
- **Unit:** percentage rounding, current-result selection, status labels, file name generation, and the text helpers.

LAN run, against the production server over HTTP, addressed by its LAN IP:

- Instructor A creates a classroom and a two-attempt activity, publishes and opens it.
- Three students join. Maria submits 3 of 3. Jose submits 0 of 3, has a retake authorised, then submits 2 of 3. Ana never submits.
- The participants endpoint reports 3 participants, 2 submitted, first-attempt average 50%, current-result average 83.34%, and the correct status for each student.
- `GET /api/activities/[id]/report` returns `200` with `application/pdf`, a `Content-Disposition: attachment` header and a file name. The file starts with `%PDF`, is 2,740 bytes, and loads in pdf-lib as one page.
- Reading the text out of that downloaded file shows the system title, instructor, classroom, activity, all three names, "Not submitted", "1 (current)" and "2 (current)", 100%, 66.67%, and the scores "2 / 3", "0 / 3" and "3 / 3". It does not show the question or answer text.
- Without a cookie: `401`. Another instructor, for the report and the participants endpoint: `404`. A student's cookie on an instructor endpoint: `401`.

**Not verified:** the PDF in a desktop PDF viewer or when printed; the visual results page on phones; the Windows commands in this guide; `prisma migrate dev` (the sandbox cannot download Prisma's schema engine, so the migration was applied with the MySQL client using the same SQL).

---

## 7. Migration details

File: `prisma/migrations/20261113110000_add_phase5_submission_max_score/migration.sql`

1. `submissions.max_score` is added as nullable `DECIMAL(8,2)`.
2. Every existing submission is set to the sum of points of its activity's questions. This is accurate because Phase 4 freezes questions once an activity opens, so the questions were the same when the attempt was marked.
3. The column is made `NOT NULL`.
4. Two CHECK constraints are added: `max_score > 0`, and `score >= 0 AND score <= max_score`.

Nothing is deleted. No existing scores change. The migration does not touch any other table.

If you want to confirm the backfill before applying it, the query in Step 5 shows the values afterwards. Before applying, you can check the expected values with:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u polling_app -p offline_polling_db -e "SELECT s.id, s.score, (SELECT SUM(q.points) FROM questions q WHERE q.activity_id = p.activity_id) AS expected_max FROM submissions s JOIN participants p ON p.id = s.participant_id;"
```

---

## 8. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `Cannot find module 'pdf-lib'` | Dependency not installed | Run `npm ci` (Step 4) |
| `migrate dev` asks to reset | Schema drift | Answer no. Run `npx prisma migrate status` and send the output. |
| `max_score` missing after migrating | Client not regenerated | Run `npx prisma generate`, then restart |
| Download opens as a web page, not a PDF | Browser blocked the download | Use the **Download PDF report** button, not the address bar; check the browser's download settings |
| `400`/`500` when downloading | Server log has details | Check the server window; send the message with the time of the request |
| PDF shows `?` for some letters | Characters outside the standard PDF font | Expected; see section 9 |
| Figures differ from an earlier screenshot | A later submission or retake was recorded | Results reflect the database; the report and the page agree |
| `Failed to fetch Geist from Google Fonts` during build | No internet during build | Build on a machine with internet access (unchanged) |

When reporting a problem, include the exact command, the full error, the output of `npx prisma migrate status`, and `node -v`. Never include the contents of `.env`.

---

## 9. Known limitations

- **Characters in the PDF.** The report uses the standard Helvetica font, which covers Western European letters (including ñ, é and similar). Other scripts, such as Chinese or Japanese, and letters with no Western European equivalent, appear as `?`. The rest of the report is unaffected. Embedding a full Unicode font would fix this, but it needs a font file added to the project, which this phase did not do.
- **Dates in the report** use the time zone of the computer running the server. For classroom use that is the instructor's computer.
- **Average figures** are simple averages across participants, not weighted by activity.
- **Live results** refresh every 10 seconds on the page, not in real time.
- **No digital signature** on the PDF. It is a record of the stored results, not a certified document.
- **Attempt timestamps** show when the submission was saved on the server. They do not show when the student started answering.

---

## 10. Completion checklist

- [ ] Step 3: overlay applied and files present.
- [ ] Step 4: `npm ci` completed.
- [ ] Step 5: `migrate status` shows the Phase 5 migration applied, and `max_score` is present.
- [ ] Step 6: `tsc`, `lint`, and every test command pass, and `db:verify` ends with `PHASE 1 READY`.
- [ ] Step 7: `npm run build` completes.
- [ ] Section 4.1: the results page shows your activity, and **Download PDF report** opens a readable PDF.
- [ ] Section 4.2: the PDF contains the names, attempts and scores you expect, and no question text.
- [ ] Commit: `git add -A` and `git commit -m "Phase 5: results and PDF reports"`.
