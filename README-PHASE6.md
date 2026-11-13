# README-PHASE6: Final Testing, Refinement and Stabilization

Phase 6 is the stabilisation pass for the Offline Classroom Polling System. It corrects four known issues, hardens the code around them, and documents what was verified and what still needs a device test.

Phase 6 changes **no database schema and adds no dependencies**. It contains no migration. Your existing migrations and data are untouched.

This guide applies the Phase 6 overlay to your existing Phase 5 project. It is written for Windows 11 and PowerShell.

---

## 1. Summary of the four known issues

| # | Issue | Root cause | Status |
|---|---|---|---|
| 1 | Dashboard showed two activities when one was archived | The **dashboard tile** was already correct. The **classroom card** counted every activity, archived ones included. | **Fixed.** Cards count active activities only. |
| 2 | Login and registration on an Infinix Hot 40i (Android 13) left the page unchanged | Not reproducible in the sandbox. The code had two real weaknesses that match the symptom: no request timeout, and a sign-in that depended on Next's client-side navigation to reach the dashboard. | **Hardened, not confirmed.** Device test required (section 5). |
| 3 | Phase 4 tests passed alone but failed together | Every Phase 4 and 5 test file cleaned up with a broad prefix (`phase`), which deleted other files' fixtures while Node ran the files in parallel. | **Fixed.** Each file now owns a unique prefix and deletes only its own rows. |
| 4 | Build warned that `C:\Users\chuan\package-lock.json` was outside the repository | Next.js picks the workspace root by walking up through parent folders. A stray lockfile in a parent folder can be chosen as the root. Reproduced here. | **Fixed** by pinning `turbopack.root` in `next.config.ts`. No files moved or deleted. |

---

## 2. Files in the overlay

| File | Change |
|---|---|
| `next.config.ts` | Pins `turbopack.root` to the project folder (issue 4). Existing CSS rule kept. |
| `src/services/classroom.service.ts` | Classroom activity count excludes archived activities (issue 1). |
| `src/lib/post-json.ts` | Request timeout and an injectable `fetch` for tests (issue 2). |
| `src/components/auth/login-form.tsx` | Full-page navigation to the dashboard after sign-in; a recoverable message if the page does not change (issue 2). |
| `src/components/auth/register-form.tsx` | The same change as the login form (issue 2). |
| `src/app/api/student/activities/[id]/submissions/route.ts` | Authenticates the participant before reading the request body (hardening). |
| `tests/helpers/fixtures.ts` | New. The shared, safe cleanup used by every database test file (issue 3). |
| `tests/unit/post-json.test.ts` | New. 4 tests: success, server error, timeout, network failure (issue 2). |
| `tests/phase6-counts.test.ts` | New. 2 tests: dashboard and classroom counts exclude archived activities (issue 1). |
| `tests/phase3-*.test.ts`, `tests/phase4-*.test.ts`, `tests/phase5-results.test.ts` | Each file uses its own fixture prefix and the shared cleanup (issue 3). Test logic unchanged. |
| `README-PHASE6.md` | This guide. |

---

## 3. Applying the overlay

Work from your project folder (the one containing `package.json`). Stop the dev server first (Ctrl+C) if it is running.

### Step 1: Back up

```powershell
cd ..
Copy-Item -Recurse "offline-classroom-polling" "offline-classroom-polling-BEFORE-PHASE6"
cd "offline-classroom-polling"
git add -A
git commit -m "Before Phase 6"
```

### Step 2: Apply the overlay

Put `phase6-overlay.zip` in your Downloads folder, then:

```powershell
Expand-Archive -Path "$HOME\Downloads\phase6-overlay.zip" -DestinationPath ".\phase6-overlay" -Force
robocopy ".\phase6-overlay" "." /E /IS /IT /NFL /NDL /NJH /NJS
Remove-Item -Recurse -Force ".\phase6-overlay"
```

Robocopy exit codes 0 to 7 mean success. Code 8 or higher is an error.

Check the key files arrived:

```powershell
Select-String -Path "next.config.ts" -Pattern "turbopack"                        # one match
Select-String -Path "src\lib\post-json.ts" -Pattern "POST_TIMEOUT_MS"            # one match
Test-Path -LiteralPath "tests\helpers\fixtures.ts"                                 # True
Test-Path -LiteralPath "tests\phase6-counts.test.ts"                              # True
```

### Step 3: Check the database state (no migration in Phase 6)

```powershell
npx prisma migrate status
```

Expected: `Database schema is up to date!`. Phase 6 adds no migration. If it reports a pending migration, stop and send us the output. Do not reset the database.

### Step 4: Dependencies

Phase 6 adds no packages. Run this only to confirm that your installed packages match the lockfile:

```powershell
npm ci
```

---

## 4. Verifying the project on your computer

Run these in order. Every test command should end with `# fail 0`.

```powershell
npx tsc --noEmit
npm run lint
npm run test:unit
npx tsx --test tests/phase6-counts.test.ts
npx tsx --test tests/phase3-activity.service.test.ts tests/phase3-builder-operations.test.ts tests/phase3-classroom.service.test.ts
npx tsx --test tests/phase4-lifecycle.test.ts tests/phase4-sessions.test.ts tests/phase4-participation.test.ts tests/phase4-scoring.test.ts tests/phase4-results.test.ts
npx tsx --test tests/phase5-results.test.ts
npx tsx --test tests/auth.service.test.ts tests/validation.test.ts
npm run db:verify
```

The database test files can now run together in one command, because they no longer clean up each other's rows. You can also run the complete set at once:

```powershell
npx tsx --test tests/unit/*.test.ts tests/auth.service.test.ts tests/validation.test.ts tests/phase3-*.test.ts tests/phase4-*.test.ts tests/phase5-*.test.ts tests/phase6-*.test.ts
```

Expected: `# tests 243`, `# pass 243`, `# fail 0`. `npm run db:verify` ends with `PHASE 1 READY - database layer verified.`

Then build:

```powershell
npm run build
```

Expected: `Compiled successfully`, with **no** warning that says `inferred your workspace root`. The build downloads Google fonts, so it needs internet access.

---

## 5. Mobile login and registration: device test

The sandbox cannot run an Android browser, so this issue is **not confirmed fixed**. The server side behaves correctly on the LAN (section 6). The remaining question is the phone's browser.

Use a **test account**, not a real instructor account.

1. Start the server for the device test:

   ```powershell
   npm run build
   npm run start -- -H 0.0.0.0 -p 3000
   ```

2. On the laptop, open `http://localhost:3000/register` and create a test account, for example `test.phone@example.com`. Use a throwaway password.
3. On the Infinix, open `http://<laptop-IP>:3000/login` (find the IP with `ipconfig`).
4. Enter the test account and tap **Sign in**. Record exactly what happens:
   - The button changes to "Signing in…" and then the dashboard opens: **fixed**.
   - The button stays busy for 15 seconds and a message appears: the network path is slow or blocked. Check Wi-Fi and the firewall (section 5 of README-PHASE4).
   - The message "Signed in, but the dashboard did not open…" appears after about 8 seconds: the browser blocked the page change. Tap **Sign in** again, and tell us the browser name and version (Settings, About).
   - Nothing changes at all, not even the busy state: tell us immediately, with the browser name and version, and whether the page reloads if you pull down.
5. Repeat with registration. Use a new e-mail address each time.

Do not use real credentials on the phone until this test passes.

If the test fails, send us: the browser name and version, the exact message or lack of one, and whether the same steps work in a different browser on the same phone.

---

## 6. What was verified in the sandbox

Everything below ran on the Phase 6 code in a Linux sandbox with Node 22 and MySQL 8.0.46. It did not run on the Windows computer or the Infinix.

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Passed |
| ESLint (app, components, lib, services, tests, scripts) | Passed, no warnings |
| All test files together | **243 passed, 0 failed** |
| Database test files run in parallel, twice | 110 passed each time (before the Phase 6 count and browser-helper tests were added) |
| `db:verify` (Phase 1 database verification) | 46 checks passed |
| Production build | Passed. No workspace-root warning, with a stray lockfile present in the parent folder |
| Authorisation sweep, every API route, no session | Every instructor and student route returns 401 or 405. No route returned 200 or 500 without a session. |
| LAN smoke test | Register returns 201; the dashboard with a session returns 200; a wrong password returns 401 with a clear message; the right password sets the session cookie; an unauthenticated dashboard request redirects to `/login` |

### 6.1 Database integrity checks

These queries were run against the live development data. Each returns 0 when the data is consistent. You can run them on your database with the MySQL client:

```sql
-- Lifecycle: OPEN and CLOSED need a code and opened_at; CLOSED needs closed_at; archived is never OPEN
SELECT COUNT(*) FROM activities
WHERE (status IN ('OPEN','CLOSED') AND (session_code IS NULL OR opened_at IS NULL))
   OR (status = 'CLOSED' AND closed_at IS NULL)
   OR (archived_at IS NOT NULL AND status = 'OPEN');

-- Scores: within 0..maximum, and the maximum is positive
SELECT COUNT(*) FROM submissions WHERE score < 0 OR score > max_score OR max_score <= 0;

-- A submitted answer's choice belongs to its question
SELECT COUNT(*) FROM submission_answers sa JOIN choices c ON c.id = sa.selected_choice_id
WHERE c.question_id <> sa.question_id;

-- Awarded points match correctness
SELECT COUNT(*) FROM submission_answers sa JOIN questions q ON q.id = sa.question_id
WHERE (sa.is_correct = 1 AND sa.awarded_points <> q.points) OR (sa.is_correct = 0 AND sa.awarded_points <> 0);

-- A submission's score equals the sum of its awarded points
SELECT COUNT(*) FROM submissions s
LEFT JOIN (SELECT submission_id, SUM(awarded_points) AS total FROM submission_answers GROUP BY submission_id) a
  ON a.submission_id = s.id
WHERE s.score <> COALESCE(a.total, 0);

-- A used retake implies a second attempt exists
SELECT COUNT(*) FROM retake_authorizations r
WHERE r.used_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.participant_id = r.participant_id AND s.attempt_number = 2);

-- A second attempt only exists with an authorised retake
SELECT COUNT(*) FROM submissions s
WHERE s.attempt_number = 2
  AND NOT EXISTS (SELECT 1 FROM retake_authorizations r WHERE r.participant_id = s.participant_id);

-- No duplicate normalised names within one activity
SELECT COUNT(*) FROM (
  SELECT activity_id, normalized_name FROM participants GROUP BY activity_id, normalized_name HAVING COUNT(*) > 1
) d;
```

Run them with:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u polling_app -p offline_polling_db -e "PASTE A QUERY HERE"
```

### 6.2 The four issues in detail

**Issue 1: active counts.** A test reproduced the report before the fix: the classroom card showed an activity count that included an archived activity. The dashboard tile was already correct. The fix filters the classroom count to active activities, the same rule the dashboard uses. The card's count can now be lower than the number of activities you created, and that is intended.

**Issue 2: mobile sign-in.** Three changes:

- The request helper now gives up after 15 seconds and shows "The server took too long to respond". Previously a stalled request left the form busy with no message.
- After a successful sign-in, the form uses a full page navigation to `/dashboard`. The previous code used Next's client-side navigation, which fetches data before the page changes. If a mobile browser fails that fetch, the page looks unchanged. The session cookie is set before the navigation, so a plain page load is enough.
- If the page does not change within 8 seconds, the form clears its busy state and says so.

The helper has four unit tests. The form components themselves have no automated test in this project, because the project has no browser test framework. The device test in section 5 covers them.

**Issue 3: test isolation.** Each database test file now has its own e-mail prefix, and the shared helper `tests/helpers/fixtures.ts` deletes only rows under that prefix. The helper refuses a prefix that is too short, so a mistake cannot delete everything. Before the change, the Phase 4 and 5 cleanup used a prefix that matched every other file's fixtures.

**Issue 4: workspace root.** A stray `package-lock.json` in a parent folder produced the warning, and the build reported it as the workspace root. Setting `turbopack.root` in `next.config.ts` tells Next.js the project folder is the root. The stray lockfile is still there. Whether to delete it is your decision: it is not needed by this project, so if you do not use it, you can remove it yourself. The overlay does not delete it.

### 6.3 Hardening

- The student submission route now checks the participant's token before it reads the request body. Previously it validated the body first. The result for an unauthenticated caller is the same 401, but the validation no longer runs before the check.
- `POST /api/auth/logout` returns 200 even without a session. This is harmless: logging out twice does nothing. It is left unchanged.

---

## 7. Known limitations

These carry over from earlier phases or remain open. None is caused by Phase 6.

- **Mobile sign-in is unconfirmed** until the device test in section 5 passes.
- **LAN uses plain HTTP.** Cookies are marked Secure only over HTTPS. This matches the master prompt's LAN-only design.
- **The student join limit is global.** It applies to invalid session codes across all students on the LAN, so a class with many typing mistakes can be slowed for up to 10 minutes. It is held in memory and resets when the server restarts.
- **Student identity is by name only.** Two students with the same name cannot both join. The instructor can release access.
- **Answers are saved only on submit.** A student whose browser closes before submitting loses those answers.
- **PDF reports use a standard font.** Characters outside Western European letters appear as `?`.
- **The results page refreshes every 10 seconds,** rather than pushing live updates.
- **The Windows commands in every Phase guide** were written for PowerShell and not run on Windows in this sandbox. The sandbox output is the evidence for the logic; your machine's run is the evidence for the setup.
- **No load testing.** The application has been tested with small classes only.

### 7.1 Security action still needed

Your `.env.example` file contains a database password that looks like a real one (it begins with `sjjm`; the rest is not repeated here). It came with the original project and this phase did not change it. Replace the password in `.env.example` with a placeholder such as `REPLACE_ME`. If that password is used on any real database, change it there too.

---

## 8. Recommended next steps

1. Complete the device test in section 5 and report the result.
2. Replace the password in `.env.example` (section 7.1).
3. Decide whether to delete the stray `C:\Users\chuan\package-lock.json`.
4. Run section 4 on your Windows computer and report any failure with its full output.
5. Consider a browser-level test of the sign-in forms (for example with Playwright) so the mobile flow can be checked automatically in future.

---

## 9. Completion checklist

- [ ] Step 1 backup committed.
- [ ] Step 2 overlay applied and the key files are present.
- [ ] Step 3 `migrate status` reports the schema is up to date.
- [ ] Section 4: `tsc`, `lint`, all tests, and `db:verify` pass on your computer.
- [ ] Section 4: `npm run build` completes with no workspace-root warning.
- [ ] Section 5: the Infinix sign-in test is complete, with the result reported.
- [ ] Section 7.1: `.env.example` password replaced with a placeholder.
