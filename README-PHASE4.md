# README-PHASE4: Student Participation and Archive Management

This guide describes Phase 4 of the Offline Classroom Polling System and how to apply it to your existing Phase 3 project. It is written for Windows 11 and PowerShell.

Phase 4 lets an instructor open an activity for students, students join with a name and a session code (no account), answer the questions, and submit once. The server scores each attempt. The instructor watches participation and results, can authorise one retake, can release a student's access if they lose their device, and can archive and restore activities and classrooms.

---

## 1. What Phase 4 adds

| Area | What works |
|---|---|
| Sessions | Open a published activity to issue an 8-character session code. Close it. A code is random and unique. |
| Joining | Students open `/join`, enter their full name and the code, and get a per-activity participant cookie. Codes are case- and separator-insensitive. |
| Answering | Students see the questions and choose one answer per question. Only the server decides what is shown. |
| Submitting | One submission per attempt. Blank questions score zero and ask for confirmation. The score is computed on the server from the stored answer key. |
| Deadlines | An activity closes automatically at its scheduled closing time. Students cannot join or submit after that. |
| Time limit | An optional duration per attempt, measured from when the questions were first shown, and never past the closing time. |
| Retakes | An activity with an attempt limit of 2 allows one retake, which the instructor authorises once, only while the session is open. |
| Results | Instructor: participants, every attempt with score and percentage, average, question statistics. Student: their own attempts and scores. |
| Access release | If a student loses their device, the instructor releases access. The old browser stops working at once. The same name can rejoin and keeps its history. |
| Archiving | Activities and classrooms can be archived and restored. Archiving keeps everything. Archiving an open activity or classroom closes it first. |
| Privacy | Correct answers, session tokens and other students' names are never sent to a student. Tokens are stored only as SHA-256 hashes. |

### 1.1 Decisions applied

You did not reply to the nine decisions in the plan, so I applied the recommended default for each. Change any of them by asking; they are listed here so nothing is hidden.

| # | Decision | Applied |
|---|---|---|
| 1 | Opening requires a published activity | Yes. Opening re-runs the publish rules at open time. |
| 2 | Scheduled closing time passes | The activity closes automatically at the next request. `closed_at` is the scheduled time. |
| 3 | When a timed attempt starts | When the questions are first shown. Answers are saved only on submit, so a student who runs out of time loses unsubmitted answers. |
| 4 | Score visibility | Students see their total score and percentage after submitting. They never see correct answers, and per-question right/wrong is not shown. |
| 5 | Lost device | Rejoining by name is refused, except after the instructor releases access. |
| 6 | Archiving an open activity | It is closed first. Restoring keeps its status. |
| 7 | Retakes | Only when the activity's attempt limit is 2. |
| 8 | Archived classroom | Its activities cannot be opened until the classroom is restored. |
| 9 | Participant cookies | One per activity (`ocp_participant_<activityId>`), so one browser can join several activities. |

### 1.2 Not included in Phase 4

- PDF reports (master prompt Phase 7).
- Automatic saving of answers while a student is working.
- True/false questions.
- Students identifying themselves beyond their name (the master prompt does not allow it).
- Live push updates: the instructor's results page refreshes every 10 seconds instead.
- HTTPS. The LAN deployment serves plain HTTP, as the master prompt specifies.

---

## 2. Changes to Phase 3 behaviour

Phase 4 tightens a few Phase 3 rules, as the master prompt requires. Your Phase 3 tests have been updated where needed and all still pass.

| Action | Phase 3 | Phase 4 |
|---|---|---|
| Edit an activity's questions or choices | Blocked only after students joined | Blocked once the activity is OPEN or CLOSED (`ACTIVITY_OPENED`), and when archived |
| Publish or unpublish | Allowed any time | Drafts only |
| Delete an activity | Drafts with no student records | Drafts only (`ACTIVITY_NOT_DRAFT`). Opened or closed activities must be archived. |
| Archive a classroom | Hides it and blocks new activities | Also closes any OPEN activity in it |
| Dashboard counts | All activities | Active (non-archived) activities only |
| Archive a classroom via API | `DELETE /api/classrooms/[id]` | Also `POST /api/classrooms/[id]/archive` (the master prompt's route). `DELETE` still works. |

---

## 3. Files

### 3.1 Database

| File | Purpose |
|---|---|
| `prisma/migrations/20261113090000_add_phase4_participation/migration.sql` | Adds `activities.archived_at` and the `attempt_starts` table, with CHECK constraints (attempt number 1 or 2; an archived activity is never OPEN). |
| `prisma/migrations/20261113100000_add_phase4_release_access/migration.sql` | Adds `participants.access_released_at`. |
| `prisma/schema.prisma` | Updated to match (three additions, nothing removed). |

Both migrations are additive. Nothing existing is removed or rewritten. Phase 1 and 2 migrations are unchanged.

### 3.2 Application

| File | Purpose |
|---|---|
| `src/lib/session-code.ts` | Generates and checks session codes (8 characters, no 0/O/1/I/L). |
| `src/lib/student-name.ts` | Name rules and the normalised form used to detect duplicates. |
| `src/lib/attempt-rules.ts` | Pure rules: attempt planning, deadlines, scoring. No database. |
| `src/lib/participant-session.ts` | The per-activity participant cookie. |
| `src/services/lifecycle.ts` | Closes an activity whose scheduled closing time has passed. |
| `src/services/session.service.ts` | Open, close, archive and restore an activity. |
| `src/services/student.service.ts` | Join, authenticate a participant, submit answers, the student view. |
| `src/services/results.service.ts` | Instructor results, retake authorisation, access release. |
| `src/services/classroom.service.ts` | Changed: archive closes open activities; restore; list archived. |
| `src/services/activity.service.ts` | Changed: lifecycle guards; archived list; session fields on DTOs. |
| `src/lib/rate-limit.ts` | Adds a limiter for invalid session codes. |
| `src/lib/builder-validation.ts` | Adds join and submission schemas. |
| `src/lib/dto-types.ts` | Adds session and archive fields. |

API routes:

| Route | Method | Who |
|---|---|---|
| `/api/student/join` | POST | Anyone with a valid code (rate-limited on invalid codes) |
| `/api/student/activities/[id]` | GET | The participant holding this activity's cookie |
| `/api/student/activities/[id]/submissions` | POST | The same participant, once per attempt |
| `/api/activities/[id]/open` | POST | Instructor (owner) |
| `/api/activities/[id]/close` | POST | Instructor (owner) |
| `/api/activities/[id]/archive` | POST | Instructor (owner) |
| `/api/activities/[id]/restore` | POST | Instructor (owner) |
| `/api/activities/[id]/results` | GET | Instructor (owner) |
| `/api/activities/[id]/participants/[participantId]/retake` | POST | Instructor (owner) |
| `/api/activities/[id]/participants/[participantId]/release-access` | POST | Instructor (owner) |
| `/api/classrooms/[id]/archive` | POST | Instructor (owner) |
| `/api/classrooms/[id]/restore` | POST | Instructor (owner) |
| `/api/classrooms?archived=true`, `/api/activities?archived=true` | GET | Instructor (owner) |

Pages:

| Page | Who |
|---|---|
| `/join` | Students |
| `/student/activities/[id]` | Students (redirects to `/join` without the right cookie) |
| `/activities/[id]/results` | Instructor: participants, results, question statistics |
| `/activities/archived`, `/classrooms/archived` | Instructor: archived items, with restore |

The student area has its own minimal layout (`src/app/(student)/layout.tsx`). Students have no login.

### 3.3 Tests and scripts

| File | Tests |
|---|---|
| `tests/unit/session-code.test.ts` | 4 |
| `tests/unit/student-name.test.ts` | 4 |
| `tests/unit/scoring.test.ts` | 10 |
| `tests/phase4-lifecycle.test.ts` | 5 |
| `tests/phase4-sessions.test.ts` | 19 |
| `tests/phase4-participation.test.ts` | 15 |
| `tests/phase4-scoring.test.ts` | 14 |
| `tests/phase4-results.test.ts` | 10 |
| `scripts/verify-phase1.ts` | Updated: the inventory now allows the Phase 4 table and foreign key, and still fails for any unexpected object. |

---

## 4. Setup: applying Phase 4 to your project

Do these steps in order, from your project folder (the one containing `package.json`). Your Phase 3 project should be working first.

### Step 1: Stop the development server

Press Ctrl+C in the window running `npm run dev`.

### Step 2: Back up

```powershell
cd ..
Copy-Item -Recurse "offline-classroom-polling" "offline-classroom-polling-BEFORE-PHASE4"
cd "offline-classroom-polling"
git add -A
git commit -m "Before Phase 4"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u polling_app -p offline_polling_db > "..\offline_polling_db-BEFORE-PHASE4.sql"
```

Adjust the MySQL path if it is installed elsewhere. `mysqldump` prompts for the password.

### Step 3: Apply the overlay

Put `phase4-overlay.zip` in Downloads, then:

```powershell
Expand-Archive -Path "$HOME\Downloads\phase4-overlay.zip" -DestinationPath ".\phase4-overlay" -Force
robocopy ".\phase4-overlay" "." /E /IS /IT /NFL /NDL /NJH /NJS
Remove-Item -Recurse -Force ".\phase4-overlay"
```

Robocopy exit codes 0 to 7 mean success. Code 8 or higher is an error.

Confirm the new files are present:

```powershell
Test-Path -LiteralPath "src\services\student.service.ts"          # True
Test-Path -LiteralPath "prisma\migrations\20261113100000_add_phase4_release_access\migration.sql"  # True
```

### Step 4: Apply the database migrations

```powershell
npx prisma validate
npx prisma migrate status
npx prisma migrate dev
npx prisma generate
```

`migrate status` should list two pending migrations: `20261113090000_add_phase4_participation` and `20261113100000_add_phase4_release_access`. `migrate dev` should apply them and report that the database is in sync.

If `migrate dev` asks to reset the database, answer **no** and press Ctrl+C. Send the output of `npx prisma migrate status`.

Verify the new columns and table:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u polling_app -p offline_polling_db -e "SHOW COLUMNS FROM activities LIKE 'archived_at'; SHOW COLUMNS FROM participants LIKE 'access_released_at'; SHOW TABLES LIKE 'attempt_starts';"
```

### Step 5: Check the project

```powershell
npm ci
npx tsc --noEmit
npm run lint
npm run test:unit
npx tsx --test tests/phase4-lifecycle.test.ts
npx tsx --test tests/phase4-sessions.test.ts
npx tsx --test tests/phase4-participation.test.ts
npx tsx --test tests/phase4-scoring.test.ts
npx tsx --test tests/phase4-results.test.ts
npx tsx --test tests/phase3-activity.service.test.ts tests/phase3-builder-operations.test.ts tests/phase3-classroom.service.test.ts
npx tsx --test tests/auth.service.test.ts tests/validation.test.ts
npm run db:verify
```

Each command should finish with `fail 0`, and `db:verify` should end with `PHASE 1 READY`.

### Step 6: Build

```powershell
npm run build
```

Expected: `Compiled successfully`. The build needs internet access to download Google fonts, as it did before Phase 4.

---

## 5. Running for a classroom (LAN)

### 5.1 Find this computer's address and open the firewall

```powershell
ipconfig | Select-String "IPv4"
```

Use the address on your Wi-Fi adapter, for example `192.168.1.20`. Then, in PowerShell **as administrator**:

```powershell
New-NetFirewallRule -DisplayName "Offline Polling (Next.js 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

If you already created this rule for Phase 2 or 3, skip this step.

### 5.2 Start the server

For a session, the production server is more stable than the development server:

```powershell
npm run start -- -H 0.0.0.0 -p 3000
```

The instructor opens `http://<your-address>:3000/login` on this computer. Students open `http://<your-address>:3000/join` on their own devices, on the same Wi-Fi.

Keep the window open for the whole lesson. Sessions and results are stored in MySQL, so a restart does not lose them. The join limiter and login limiter are in memory, so a restart clears them.

---

## 6. Using Phase 4

### 6.1 Instructor

1. Create a classroom and an activity, then publish it (Phase 3).
2. On the activity page, click **Open session** and confirm. A large **session code** appears.
3. Tell the students the code. Students open `/join` on their devices.
4. Click **Participants & results**. The page refreshes every 10 seconds and lists each student, their attempts and scores, and any retake status.
5. For an activity that allows two attempts, click **Authorise retake** next to a student who has submitted once. This is allowed only while the session is open, and only once per student.
6. If a student loses their device, click **Release access** and confirm. Their old browser stops working. They can rejoin with the same name, and their earlier submissions are kept.
7. Click **Close session** when the lesson ends, or let the scheduled closing time close it.
8. **Archive** keeps the activity and its results and hides it from the active list. **Restore** brings it back. Archived activities appear under **Archived** on the Activities page.

Classrooms can be archived and restored the same way, under **Archived** on the Classrooms page. Restoring a classroom does not reopen its activities.

### 6.2 Student

1. On a phone or laptop, open `http://<instructor's address>:3000/join`.
2. Enter the session code and your full name, then tap **Join**. Hyphens and spaces in the code are optional.
3. The questions appear with a time left if the activity has a time limit. Choose one answer per question.
4. Tap **Submit answers**. If some questions are blank, you are asked to confirm, because blank questions score zero.
5. Your score appears after you submit. You cannot change your answers after submitting.
6. If your instructor authorises a retake, the questions appear again as attempt 2. You have one retake at most.

If you close the page, come back to the same address on the same device. Your place is kept for that browser.

---

## 7. Security summary

- **Authorization on every route.** Instructor routes check the session cookie on the server and scope every query to the instructor's own activities. Another instructor's activity returns `404`, which does not reveal whether it exists.
- **Participant tokens.** A random 256-bit token is set in an HttpOnly cookie, one per activity. The database stores only its SHA-256 hash. A token works only for the activity it was issued for; any other combination gets the same `401`.
- **No correct answers to students.** The student view queries choices without the correctness flag, and tests check the JSON for it. Only instructor routes return correctness.
- **Server-side scoring.** The browser sends question and choice IDs only. The server checks that each choice belongs to its question, looks up the points and correctness, and writes the score. A snapshot of each answer's correctness and points is stored with the submission, so the history cannot change if the answer key is edited later.
- **Race-safe.** The activity row is locked during join and submit. Two submissions for one attempt cannot both succeed, and nothing joins after closing. Tests check this with simultaneous requests.
- **Deadlines use server time.** The browser's clock is used only for the on-screen countdown. The server decides whether an attempt has expired.
- **CSRF.** Every state-changing request checks the `Origin` header, as in Phase 2. Cross-site requests get `403`.
- **Throttling.** Invalid session codes are limited to 50 per 10 minutes, globally. This is deliberately global: route handlers cannot see each student's address on the LAN.
- **Privacy.** Students see only their own name and results. Instructor responses never include session tokens or hashes.

---

## 8. Manual testing checklist

Work through this with a real instructor browser and at least two student devices on the same Wi-Fi.

Instructor:
- [ ] Log in, open **Activities**, and open a published activity. **Open session** appears with a confirmation.
- [ ] After opening, the 8-character session code is shown. Questions can no longer be edited (the edit link is gone).
- [ ] Open **Participants & results**. It shows "0 participants" and refreshes.
- [ ] Close the session. Students get "closed" when they try to submit.
- [ ] Archive an open activity. It closes first, moves to **Archived**, and restoring it keeps it closed.
- [ ] Archive a classroom with an open activity. The activity closes. Restoring the classroom does not reopen it.

Students:
- [ ] Open `/join` on a phone. The page is readable and the buttons are easy to tap.
- [ ] Join with the code in lower case and a name with extra spaces. The name is shown tidily.
- [ ] A second device tries the same name: it is refused with a clear message.
- [ ] Choose answers and submit. The score is shown, and no correct answer is shown.
- [ ] Submit with a blank question: a confirmation appears first.
- [ ] Reload the answer page after submitting. The results are still shown, and the questions are not.
- [ ] With a time limit, the countdown runs. After the limit, the questions are replaced by a time-up notice.

Retakes and access:
- [ ] Authorise a retake for a student who has submitted. The student sees attempt 2, and the instructor's retake badge shows "Used" after they submit.
- [ ] Release access for a student. Their old page stops working. They rejoin with the same name, and their earlier score is still there.

Security (use a second browser or private window):
- [ ] A student opens another activity's answer page. They are sent back to `/join`.
- [ ] A second instructor account cannot open the first instructor's results page (not found).

---

## 9. Verification results

Everything below was run in a Linux sandbox with Node 22, MySQL 8.0.46, and the same code. It was **not** run on your Windows computer, so run Step 5 and Step 6 there.

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Passed, no errors |
| ESLint on the application and tests | Passed, no errors |
| Unit tests (Phase 1 to 4) | 74 passed |
| Phase 2 auth and validation tests | 32 passed |
| Phase 3 integration tests | 37 passed |
| Phase 4 integration tests | 63 passed |
| All tests together | 206 passed, 0 failed |
| Phase 1 database verification (`verify-phase1`) | 46 checks passed |
| Production build (`next build`) | Passed, with every new route compiled |
| LAN scenario, server on `0.0.0.0` | Passed (details below) |

LAN scenario run against the production server over HTTP, addressed by the server's LAN IP:
- Instructor creates an activity with two attempts, publishes and opens it: 8-character code.
- Student joins with the code in lower case and a name with extra spaces: `201`.
- Student's view contains questions and no correctness information.
- Submission scored on the server: 2 of 3 points.
- Instructor results show the attempt and percentage, with no tokens or hashes.
- Retake authorised once; a second authorisation is refused (`409 RETAKE_EXISTS`).
- Student submits attempt 2; a third attempt is refused (`409 NO_ATTEMPT_LEFT`).
- Access released: the old cookie returns `401`; the same name rejoins; both attempts are kept.
- Duplicate name refused (`409 NAME_TAKEN`); a cookie for one activity does not open another (`401`).
- Another instructor gets `404` for results, close, and release access.
- No cookie: `401`. Student page without a cookie: redirected to `/join`.
- Requests without an Origin header, or from another origin: `403`.
- Archiving an open activity closes it; joins are refused with `409 ACTIVITY_CLOSED`; restoring keeps it closed.
- Invalid session codes: after about 50, joins return `429`, and a valid code is blocked until the window passes.
- No unhandled server errors.

**Not verified:** real phones and browsers, the Windows commands in this guide, and `prisma migrate dev` (the sandbox cannot download Prisma's schema engine, so the migrations were applied with the MySQL client; the SQL is the same).

---

## 10. Known limitations

- **Identity by name.** Two students with the same name cannot both join. An instructor can release access so the student reclaims their participation. Students cannot prove who they are.
- **Global code throttle.** The limit on invalid codes is shared by everyone on the LAN. A classroom making many typing mistakes at once could briefly be slowed down. The window is 10 minutes.
- **Answers are saved only on submit.** A student whose browser closes before submitting loses their answers, and must start again within the time limit.
- **Time limit from display.** The countdown starts when the questions are first shown and is stored against the participant. Reloading does not restart it. Releasing access does not restart it either, so a student who loses their device continues the same attempt clock.
- **Limiters reset on restart.** The invalid-code and login throttles are kept in memory.
- **Plain HTTP on the LAN.** Cookies are marked Secure only when the request is HTTPS. On the LAN they are not, which matches the master prompt's deployment.
- **Results refresh.** The instructor's page refreshes every 10 seconds. It is not a live push.
- **No PDF reports.** That is master prompt Phase 7.

---

## 11. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `Environment variable not found` | `.env` missing | Check `Test-Path .env` |
| `prisma migrate dev` asks to reset | Schema drift | Answer no. Run `npx prisma migrate status` and send the output. |
| TypeScript: `Property 'attemptStarts' does not exist` | Client not regenerated | Run `npx prisma generate` |
| Students get `Can't reach` | Firewall or wrong address | Re-check section 5.1; use the address on the same Wi-Fi |
| Join returns `429` | Too many invalid codes | Wait 10 minutes, or restart the server (clears the throttle) |
| Student sent back to `/join` unexpectedly | Cookie cleared, or a different device | Rejoin with the same name only if access was released |
| `NAME_TAKEN` for a student who lost their device | Access not released | Instructor clicks **Release access** |
| `ACTIVITY_OPENED` when editing | Session is open | Expected. Close or archive the session, or create a new activity. |
| Build fails with `Failed to fetch Geist from Google Fonts` | No internet during build | Build on a machine with internet access (unchanged from Phase 2) |
| Phase 1 verify reports an unexpected table | A later migration was not applied | Run `npx prisma migrate status` and apply pending migrations |

When reporting a problem, include the exact command, the full error, the output of `npx prisma migrate status`, and `node -v`. Never include the contents of `.env`.

---

## 12. Completion checklist

- [ ] Section 4 steps 1 to 6 completed without errors.
- [ ] Both migrations applied (`migrate status` reports the schema is up to date).
- [ ] `npm run test:unit` and the Phase 4 integration commands end with `fail 0`.
- [ ] `npm run db:verify` ends with `PHASE 1 READY`.
- [ ] `npm run build` completes.
- [ ] Section 8 manual checklist completed on real devices.
- [ ] Commit: `git add -A` and `git commit -m "Phase 4: student participation and archive management"`.
