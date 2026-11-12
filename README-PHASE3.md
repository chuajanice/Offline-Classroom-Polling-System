# README-PHASE3: Activity Builder and Classroom Management

This guide applies the Phase 3 changes to your existing **Offline Classroom Polling System** project, then runs and verifies them. It is written for Windows 11 and PowerShell. Follow the steps in order.

Phase 3 does **not** add student participation. Publishing an activity marks it as ready. It does not open a session, create a session code, or accept students. That is Phase 4.

---

## 1. What Phase 3 adds

| Area | What the instructor can do |
|---|---|
| Classrooms | Create, view, edit, and archive classrooms. Each card shows its activity count. |
| Activities | Create, view, edit, delete, save as draft, publish, and unpublish activities. The list can be filtered by classroom. |
| Questions and choices | Add, edit, delete, and reorder questions and choices. Set points per question. Mark exactly one correct answer per question. |
| Schedule | Optional opening and closing times, optional duration in minutes, and an attempt limit of 1 or 2. |
| Publishing | Strict server-side checks before publishing. Incomplete activities cannot be published. |
| Dashboard | Real counts (classrooms, activities, drafts, published) and the five most recent activities. |
| UI | Responsive layout, navigation, skeleton loading states, corner toast notifications, confirmation dialogs for destructive actions, white-to-orange theme. |

**Decisions made in this phase** (you approved these):

1. **Classrooms are archived, not hard-deleted.** The Phase 1 schema keeps activities linked to their classroom, and it was designed so history is never removed. The "Archive" button hides a classroom and blocks new activities in it. Its existing activities are kept.
2. **Publishing uses a new `published_at` column.** The status enum still only has `DRAFT`, `OPEN`, and `CLOSED`. An activity stays `DRAFT` until Phase 4 opens a session. A published activity is `DRAFT` with `published_at` set.
3. **Planned times are separate from session times.** `scheduled_opens_at` and `scheduled_closes_at` are what the instructor plans. The existing `opened_at` and `closed_at` record when a live session actually runs (Phase 4).
4. **Attempts are 1 or 2.** This matches `submissions.attempt_number` and the single authorised retake that Phase 4 will implement.
5. **No section identifier field** was added to classrooms. It was not required by the Phase 3 scope.

---

## 2. Files in this package

Package contents:

| File | Purpose |
|---|---|
| `phase3-overlay.zip` | Only the new and changed files. Extract it and copy it over your project (Section 5). |
| `offline-classroom-polling-phase3-full.zip` | Complete updated project, without `node_modules`, `.next`, `.env`, and `.git`. Use this only if you prefer replacing the whole folder. |
| `README-PHASE3.md` | This guide. |

### 2.1 New files (create)

```
prisma/migrations/20261112120000_add_phase3_activity_builder/migration.sql

src/lib/activity-rules.ts          Pure business rules: schedule checks, publish checks
src/lib/builder-validation.ts      Zod schemas for classrooms and activities, ID parsing
src/lib/dto-types.ts               Shapes returned to the browser (types only)
src/lib/datetime.ts                Converts between datetime-local values and ISO times
src/lib/format.ts                  Date formatting for server-rendered pages
src/lib/page-helpers.ts            Turns a missing (or not-owned) record into Next's 404 page
src/lib/request-json.ts            Browser helper for PATCH / DELETE / POST without a body
src/lib/ui-classes.ts              Shared orange call-to-action classes

src/services/classroom.service.ts  Classroom business logic (ownership enforced)
src/services/activity.service.ts   Activity business logic (transactions, publish rules)

src/app/api/classrooms/route.ts                 GET list, POST create
src/app/api/classrooms/[id]/route.ts            GET one, PATCH edit, DELETE (archive)
src/app/api/activities/route.ts                 GET list (?classroomId=), POST create
src/app/api/activities/[id]/route.ts            GET one, PATCH save all, DELETE
src/app/api/activities/[id]/publish/route.ts    POST publish
src/app/api/activities/[id]/unpublish/route.ts  POST unpublish

src/components/ui/textarea.tsx
src/components/ui/badge.tsx
src/components/ui/skeleton.tsx
src/components/ui/dialog.tsx           Base UI dialog wrapper
src/components/ui/confirm-dialog.tsx   Confirmation for destructive actions
src/components/ui/toast.tsx            Corner notifications (provider + useToast)

src/components/classrooms/classroom-manager.tsx   Classroom page UI
src/components/activities/activity-builder.tsx    Activity + questions + choices editor
src/components/activities/activity-actions.tsx    Publish / unpublish / delete buttons

src/app/(instructor)/classrooms/page.tsx
src/app/(instructor)/classrooms/loading.tsx
src/app/(instructor)/activities/page.tsx
src/app/(instructor)/activities/loading.tsx
src/app/(instructor)/activities/new/page.tsx
src/app/(instructor)/activities/[id]/page.tsx
src/app/(instructor)/activities/[id]/edit/page.tsx
src/app/(instructor)/dashboard/loading.tsx

tests/unit/activity-rules.test.ts
tests/unit/builder-validation.test.ts
tests/phase3-classroom.service.test.ts
tests/phase3-activity.service.test.ts
tests/phase3-builder-operations.test.ts

README-PHASE3.md
```

### 2.2 Regenerated Prisma Client (replace these files)

```
src/generated/prisma/   (Activity model and related internal files)
```

These files are generated from `prisma/schema.prisma`. The overlay already contains the Phase 3 versions. Section 4.3 runs `npx prisma generate`, which rebuilds them from your schema, so the result is the same.

### 2.3 Modified files (replace the whole file)

| File | What changed |
|---|---|
| `prisma/schema.prisma` | Six new columns on the `Activity` model (listed in Section 4). Nothing else changed. |
| `src/app/(instructor)/layout.tsx` | Adds the navigation bar and wraps pages in the toast provider. Login check unchanged. |
| `src/app/(instructor)/dashboard/page.tsx` | Replaces the Phase 2 placeholder with real statistics. |

**No changes** to `next-env.d.ts`, `package.json`, `package-lock.json`, `.env`, `.env.example`, `src/app/layout.tsx`, the Phase 1 or Phase 2 migrations, or the Phase 2 authentication code.

### 2.4 Important: check for local edits before replacing

If you have edited any of the three modified files since Phase 2, copy your version aside first and merge by hand:

```powershell
Copy-Item "prisma\schema.prisma" "prisma\schema.before-phase3.prisma"
Copy-Item "src\app\(instructor)\layout.tsx" "src\app\(instructor)\layout.before-phase3.tsx" -ErrorAction SilentlyContinue
Copy-Item "src\app\(instructor)\dashboard\page.tsx" "src\app\(instructor)\dashboard\page.before-phase3.tsx" -ErrorAction SilentlyContinue
```

---

## 3. Prerequisites

Check each item in PowerShell from your project folder.

| Requirement | Check command | Expected |
|---|---|---|
| Node.js 24 LTS (the prompt's target) | `node -v` | `v24.x.x` (any v22 or v24 works) |
| npm | `npm -v` | `10.x` or newer |
| MySQL 8.0 or 8.4 running | `Get-Service -Name "MySQL*"` | Status `Running` |
| Project already working through Phase 2 | `npm run db:status` | No error |
| Your `.env` file exists | `Test-Path .env` | `True` |

Start MySQL if it is stopped (service name may differ on your machine):

```powershell
Start-Service -Name "MySQL80"
```

Do **not** open `.env` in a screen share or paste its contents anywhere. It contains your database password.

---

## 4. Database changes

### 4.1 The new migration

Migration folder: `prisma/migrations/20261112120000_add_phase3_activity_builder`

It is **additive only**. It adds columns and CHECK constraints. It does not drop, rename, or rewrite any existing data.

**New columns on `activities`:**

| Column | Type | Default | Meaning |
|---|---|---|---|
| `scheduled_opens_at` | DATETIME(0), nullable | NULL | Planned opening time |
| `scheduled_closes_at` | DATETIME(0), nullable | NULL | Planned closing time |
| `duration_minutes` | INTEGER, nullable | NULL | Optional time limit |
| `max_attempts` | INTEGER | 1 | 1 or 2 |
| `published_at` | DATETIME(0), nullable | NULL | Set when published; NULL = draft |
| `updated_at` | DATETIME(0) | CURRENT_TIMESTAMP | Last change time |

**New CHECK constraints** (enforced by MySQL 8.0.16 and later):

| Constraint | Rule |
|---|---|
| `chk_activities_max_attempts` | `max_attempts` is 1 or 2 |
| `chk_activities_duration_positive` | `duration_minutes` is NULL or greater than 0 |
| `chk_activities_schedule_order` | If both times are set, the closing time is later than the opening time |

Prisma cannot express CHECK constraints in `schema.prisma`, so they live only in the migration SQL. This is the same approach Phase 1 uses. Prisma ignores them when it checks for drift.

**No new tables and no new enum values.**

### 4.2 Inspect the migration before applying it

```powershell
Get-Content "prisma\migrations\20261112120000_add_phase3_activity_builder\migration.sql"
```

### 4.3 Apply the migration

Run these commands from the project folder, in this order:

```powershell
# 1. Check the schema file is valid
npx prisma validate

# 2. See which migrations are pending. Expect the Phase 3 migration to be listed as not applied.
npx prisma migrate status

# 3. Apply the pending migration
npx prisma migrate dev
```

When `prisma migrate dev` runs, watch for these messages:

- **Good:** `Applying migration 20261112120000_add_phase3_activity_builder` followed by `Your database is now in sync with your schema.`
- **Stop and read carefully:** a prompt asking to **reset** the database, or a warning that the database "will be reset". **Answer no and press Ctrl+C.** Never reset. Send us the full message instead (see Section 10).

Then regenerate the Prisma Client:

```powershell
npx prisma generate
```

### 4.4 Verify the database changes

If the `mysql` command-line client is on your PATH, run this (it prompts for the password):

```powershell
mysql -u polling_app -p offline_polling_db -e "SHOW COLUMNS FROM activities;"
```

You should see `scheduled_opens_at`, `scheduled_closes_at`, `duration_minutes`, `max_attempts`, `published_at`, and `updated_at` in the output.

If `mysql` is not on your PATH, use the full path to the client, for example:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u polling_app -p offline_polling_db -e "SHOW COLUMNS FROM activities;"
```

Check that all the Phase 3 migrations are recorded:

```powershell
npx prisma migrate status
```

Expected: `Database schema is up to date!`

### 4.5 Safe recovery if a migration fails

1. **Do not reset or drop the database.** The Phase 3 changes are additive, so your existing data is safe even if the migration fails.
2. Copy the complete error message.
3. Run `npx prisma migrate status` and save the output.
4. If a partial change is left behind, restore from the backup you made in Section 6. Do not edit the migration files that were already applied (Phase 1, Phase 2).
5. Send the error message and status output for help.

---

## 5. Apply the files to your project

Put `phase3-overlay.zip` in your Downloads folder, then run these commands from your project folder (the folder that contains `package.json`):

```powershell
# Extract the overlay to a temporary folder next to the project
Expand-Archive -Path "$HOME\Downloads\phase3-overlay.zip" -DestinationPath ".\phase3-overlay" -Force

# Copy the files into the project. robocopy is used because the folder names
# contain brackets such as [id], which PowerShell's Copy-Item treats as wildcards.
robocopy ".\phase3-overlay" "." /E /IS /IT /NFL /NDL /NJH /NJS

# Remove the temporary folder
Remove-Item -Recurse -Force ".\phase3-overlay"
```

Robocopy exit codes 0 to 7 mean success. Code 8 or higher means an error.

Confirm the new files are in place:

```powershell
Test-Path "src\services\activity.service.ts"                      # True
Test-Path -LiteralPath "src\app\api\activities\[id]\publish\route.ts"  # True
Select-String -Path "prisma\schema.prisma" -Pattern "publishedAt"  # one match
```

---

## 6. Backup (do this before Section 4 if you have not already)

Back up your database and your project **before** applying Phase 3.

**Project backup** (run from the folder that contains the project folder):

```powershell
Copy-Item -Recurse "offline-classroom-polling" "offline-classroom-polling-BEFORE-PHASE3"
```

If you use Git, you can also commit the current state first:

```powershell
git add -A
git commit -m "Before Phase 3"
```

**Database backup.** `mysqldump` prompts for your password, so the password never appears in the command:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u polling_app -p offline_polling_db > "..\offline_polling_db-BEFORE-PHASE3.sql"
```

Adjust the path if MySQL is installed elsewhere. Keep the backup file private: it contains real data.

---

## 7. Dependencies

**No new packages were added in Phase 3.** `package.json` and `package-lock.json` are unchanged.

The toast notifications and the confirmation dialog are built in-house on top of the existing Base UI library (`@base-ui/react`), which the project already uses through shadcn/ui. This avoided adding an extra package.

If `node_modules` is missing or was removed, reinstall from the lockfile:

```powershell
npm ci
```

---

## 8. Application setup

### 8.1 Environment variables

**No changes.** Your existing `.env` (`DATABASE_URL` and `SHADOW_DATABASE_URL`) works unchanged.

### 8.2 Start the development server (this computer only)

```powershell
npm run dev
```

Open <http://localhost:3000/login> in a browser.

### 8.3 Start for classroom use (other devices on the same Wi-Fi)

1. Find this computer's IPv4 address:

   ```powershell
   ipconfig | Select-String "IPv4"
   ```

   Look for the address on your Wi-Fi or Ethernet adapter, for example `192.168.1.20`.

2. Allow the port through Windows Firewall. Run PowerShell **as administrator**:

   ```powershell
   New-NetFirewallRule -DisplayName "Offline Polling (Next.js 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```

3. Start the server on all network interfaces:

   ```powershell
   npm run dev -- -H 0.0.0.0
   ```

4. From a phone or another laptop on the same network, open `http://<your-IP>:3000/login`, for example `http://192.168.1.20:3000/login`.

For a classroom session, the production build is faster and more stable than the development server. See Section 9.4.

---

## 9. Feature walkthrough

Log in, then follow these steps.

### 9.1 Create and manage a classroom

1. Click **Classrooms** in the top navigation.
2. Click **New classroom**. Enter a name (required) and an optional description. Click **Create classroom**.
3. To change a classroom, click **Edit** on its card, change the fields, and click **Save changes**.
4. To archive a classroom, click **Archive** and confirm. The classroom disappears from the list. Its activities are kept, and no new activities can be added to it.

Archived classrooms cannot be edited.

### 9.2 Create an activity

1. Click **Activities**, then **New activity** (or **New activity** on the dashboard).
2. Choose a classroom, enter a title (required), and optionally add instructions.
3. Under **Schedule and attempts**, optionally set **Opens**, **Closes**, a **Duration in minutes**, and the number of attempts (1, or 2 for one retake).
4. Click **Save draft** at any time. Drafts may be incomplete.

### 9.3 Add, edit, delete, and reorder questions and choices

1. Click **Add question**. Type the question text and set the points (1 to 100).
2. Under the question, each choice has a text box, a radio button, and up and down arrows.
   - Type each choice in its text box. Click **Add choice** to add more (up to 6).
   - Click the radio button next to the correct answer. Selecting a new radio button moves the correct answer there. Only one can be selected at a time.
   - Click the arrow buttons to reorder choices, or the trash icon to remove one.
3. Use the arrow buttons on a question card to reorder questions, or the trash icon to remove it.
   - Removing a question or a choice asks for confirmation first. Nothing is removed until you confirm.
4. Click **Save draft** to keep the changes.

Changes are saved together, so either everything saves or nothing does.

### 9.4 Publish an activity

1. Click **Save and publish**. The server first saves everything, then checks it. Publishing is refused, with messages next to each problem, if any of these are true:
   - The title is blank.
   - The classroom is archived.
   - There is no opening time, no closing time, or the closing time is not in the future.
   - The closing time is not later than the opening time.
   - The duration is longer than the open window.
   - There are no questions.
   - A question has blank text, points outside 1 to 100, fewer than 2 choices, or a choice with blank text.
   - A question does not have exactly one correct answer.
2. When publishing succeeds, the activity page shows **Published**. Publishing does not open the activity to students.

### 9.5 Edit or unpublish a published activity

- Click **Edit** on a published activity and change anything. Saving returns it to **Draft**, so you must publish it again. This prevents students from working on a version that differs from the one you validated.
- Click **Unpublish** to return it to draft without changing it.

### 9.6 Delete an activity

Click **Delete** on the activity page and confirm. This permanently removes the activity with its questions and choices. Activities that have student records cannot be deleted. In Phase 3 there are never any student records.

### 9.7 Use the dashboard

The dashboard shows four counts (classrooms, activities, drafts, published), the five most recently changed activities, and buttons for managing classrooms and creating an activity.

---

## 10. Testing and verification

Run all commands from the project folder. Stop the dev server first (Ctrl+C) so the test database connection is not shared with it, if you see connection errors.

### 10.1 Unit tests (no database needed)

```powershell
npm run test:unit
```

This runs the pure rules (schedule and publish checks, datetime conversions), the Zod schemas, and the existing Phase 2 security tests.

### 10.2 Phase 3 integration tests (real MySQL)

```powershell
npx tsx --test tests/phase3-classroom.service.test.ts
npx tsx --test tests/phase3-activity.service.test.ts
npx tsx --test tests/phase3-builder-operations.test.ts
```

These create temporary instructors whose emails start with `phase3-`, test against the real database, and remove their own rows afterwards.

### 10.3 Regression tests (Phase 1 and 2)

```powershell
npx tsx --test tests/auth.service.test.ts tests/validation.test.ts
npm run db:verify
```

### 10.4 Production build

```powershell
npm run build
```

Expected: the build finishes with `Compiled successfully`, and the route list includes `/classrooms`, `/activities`, `/activities/[id]`, `/activities/[id]/edit`, `/activities/new`, `/dashboard`, and the `/api/classrooms` and `/api/activities` routes.

To run the built app for a session:

```powershell
npm run start -- -H 0.0.0.0 -p 3000
```

### 10.5 Results observed while preparing this package

The package was built and tested in a Linux sandbox, **not** on your Windows machine. The commands above are the same, but your results may differ. The results below were observed in that sandbox (Node 22, MySQL 8.0.46):

| Check | Result |
|---|---|
| Schema validates and Prisma Client regenerates | Passed |
| TypeScript type check (`tsc --noEmit`) | Passed, no errors (re-run after the final changes) |
| ESLint on the Phase 3 code | Passed, no warnings |
| Unit tests (`tests/unit/*`) | 42 passed, 0 failed |
| Classroom integration tests | 6 passed, 0 failed |
| Activity builder integration tests | 21 passed, 0 failed |
| Question and choice operation tests (add, edit, delete, reorder, correct-answer rules) | 10 passed, 0 failed |
| Phase 2 auth service tests | 32 passed, 0 failed (includes validation tests) |
| Phase 1 verification (`npm run db:verify`) | 46 passed, 0 failed |
| Production build (`next build`) | Passed, all routes compiled |
| Total of all test files run together | 125 passed, 0 failed |
| HTTP checks against the running production server | Unauthenticated requests return 401. Requests without a valid origin return 403. An instructor reading another instructor's activity or creating in their classroom gets 404. Create, publish, edit-returns-to-draft, unpublish, and delete all behaved as specified. No unhandled server errors. |

**What was not verified in the sandbox:** the Windows and PowerShell commands in this guide, the `prisma migrate dev` run (the sandbox could not download Prisma's schema engine, so the migration was applied with the MySQL client instead), the visual design on real screens, and the LAN access steps.

### 10.6 Manual browser checklist

- [ ] Log in. The dashboard shows the four counts and an empty state if nothing exists.
- [ ] Create a classroom. It appears as a card with `0 activities`.
- [ ] Edit the classroom name. The change appears immediately.
- [ ] Archive a classroom, confirm the dialog, and check that it disappears from the list.
- [ ] Create an activity with only a title and click **Save draft**. A toast confirms, and the URL changes to `/activities/<id>/edit`.
- [ ] Click **Save and publish** on an incomplete activity. It is refused, and the problems are highlighted.
- [ ] Add two questions, two choices each, one correct answer each, a future schedule, and publish. The page shows **Published**.
- [ ] Reorder questions and choices, save, and confirm the order persists after a page refresh.
- [ ] Edit the published activity and save. It shows **Draft** again.
- [ ] Unpublish, then delete. The deleted activity returns 404 if you open its URL.
- [ ] Remove a question and a choice: a confirmation appears, and cancelling keeps the item.
- [ ] Open the site on a phone (Section 8.3). Navigation, forms, and the bottom action bar remain usable.
- [ ] Log out, then open `/dashboard`. You are redirected to `/login`.

---

## 11. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `Environment variable not found` or `DATABASE_URL is not set` | Missing or misnamed `.env` | Run `Test-Path .env`. It must be in the project root. |
| `Can't reach database server` / `ECONNREFUSED 3306` | MySQL is stopped | `Start-Service -Name "MySQL80"`, then retry. |
| `Access denied for user` | Wrong password in `.env` | Check `.env`. Special characters must be percent-encoded (`@` becomes `%40`). |
| `prisma migrate dev` asks to reset | Schema drift detected | Answer **no** and stop. Run `npx prisma migrate status` and send the output. |
| `P3014` / cannot create shadow database | `SHADOW_DATABASE_URL` user lacks rights | Check the Phase 1 `scripts/mysql-setup.sql` steps. |
| TypeScript error `Property 'publishedAt' does not exist` | Prisma Client not regenerated | Run `npx prisma generate`, then restart the dev server. |
| `Module not found: Can't resolve '@/components/ui/dialog'` | A file from the overlay was not copied | Re-run the robocopy step in Section 5 and confirm the file exists. |
| Build fails with `Failed to fetch Geist from Google Fonts` | The project uses `next/font/google`, which downloads fonts during the build | Run the build on a computer with internet access. The fonts are then bundled, so the running app works offline. This was already true before Phase 3. |
| `403 BAD_ORIGIN` on a save | The page was opened by an address that does not match the request's host | Open the app using the same address you typed, for example `http://192.168.1.20:3000`, not a bookmark from another address. |
| `401` on every request | Session expired (8 hours) | Log in again. |
| Save fails with `VALIDATION_ERROR` | Invalid field values | Read the highlighted fields and correct them. |
| `409 ACTIVITY_IN_USE` | Student records exist (not expected in Phase 3) | Stop and report it, because it would mean Phase 4 data already exists. |
| Dev server shows `EADDRINUSE :3000` | Another process uses port 3000 | `netstat -ano \| findstr :3000`, then stop that process, or use `-p 3001`. |
| Phone cannot open the site | Firewall or wrong IP | Re-check Section 8.3 steps 1 and 2. Make sure the phone is on the same Wi-Fi. |

When you report a problem, include: the exact command you ran, the full error text, the output of `npx prisma migrate status`, and your Node version (`node -v`). Do not include `.env` contents.

---

## 12. Phase 3 completion checklist

Mark each item as you verify it.

- [ ] Section 4.3: `npx prisma migrate dev` applied `20261112120000_add_phase3_activity_builder`.
- [ ] Section 4.4: `SHOW COLUMNS FROM activities` lists the six new columns.
- [ ] Section 4.4: `npx prisma migrate status` reports the schema is up to date.
- [ ] Section 9: every walkthrough step works in the browser, including the confirmation before removing a question or choice.
- [ ] Section 10.1: `npm run test:unit` reports `fail 0`.
- [ ] Section 10.2: all three Phase 3 integration test files report `fail 0`.
- [ ] Section 10.3: Phase 2 and Phase 1 regression checks pass.
- [ ] Section 10.4: `npm run build` completes.
- [ ] Section 10.6: manual browser checklist complete.

### 12.1 Features implemented in Phase 3

- Classroom create, list, edit, and archive, with ownership enforced on every request.
- Activity create, list (with classroom filter), view, edit, delete, draft, publish, and unpublish.
- Confirmation dialogs before removing a question, a choice, a classroom (archive), or an activity.
- Question and choice builder: add, edit, delete, reorder, points, and exactly one correct answer per question. Removing a question or choice asks for confirmation.
- Schedule with server-side validation, optional duration, and attempt limit (1 or 2).
- Server-side publish validation, with field-level messages.
- Dashboard statistics and recent activities.
- Responsive layout, loading skeletons, toast notifications, confirmation dialogs.

### 12.2 Known limitations

- **True/False questions are not included.** Only single-answer multiple choice is supported, as the prompt prioritised.
- **Search is not included.** The activity list can be filtered by classroom only.
- **Classrooms cannot be permanently deleted.** Archiving is the only removal. This is deliberate (decision 1 in Section 1).
- **No section or class code field** on classrooms.
- **The whole activity is saved at once.** Editing a question replaces the question list in a single transaction, rather than updating one row at a time. This keeps positions consistent and avoids partial saves. It is safe in Phase 3 because no student data references questions yet. Phase 4 must keep the check that refuses structural edits once students have participated.
- **Times use the computer's local time zone.** The server stores UTC. Dates are displayed in the server computer's time zone, which is the instructor's own computer in a classroom setup.
- **The visual theme** uses orange gradients and glow on buttons and highlights, applied through shared class names in `src/lib/ui-classes.ts`. The global shadcn colour variables in `globals.css` were not changed. Retheming the whole app is a follow-up task.
- **Browser testing** was not done on real devices. Use the checklist in Section 10.6.

### 12.3 Reserved for Phase 4 (not implemented here)

- Student session codes, joining, and temporary student identities.
- Answer submission, automatic scoring, and student result displays.
- Live monitoring of participants and submissions.
- Opening and closing a live session (this sets `opened_at`, `closed_at`, and the session code).
- Retake authorisation for a second attempt.
- PDF reports.

Phase 3 leaves the database ready for these features: `activities.published_at` marks readiness, `scheduled_*` holds the plan, `max_attempts` is stored, and the `participants`, `submissions`, and related tables are untouched.

---

## 13. Security notes

- Every Phase 3 API route checks the session cookie on the server. The instructor's ID comes only from the session, never from the request.
- Every route that changes data checks that the request came from this application (the same CSRF protection as Phase 2).
- Records that belong to another instructor return `404 Not Found`, which does not reveal whether they exist.
- Correct-answer flags are returned only by instructor-authorised endpoints. No student-facing endpoint exists yet.
- Error responses never include database details. Unexpected errors are logged on the server only.
- Request bodies are validated with Zod before they reach the database. Position numbers are assigned by the server from the order in the request.
- Multi-table saves run in transactions, so a failed save leaves no partial data.
