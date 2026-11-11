# Phase 2: Authentication

Instructor registration, login, logout, server-side sessions, and protected instructor pages. Design details: `docs/PHASE2_AUTH.md`.

**Status of these files:** the pure logic (security helpers, throttle, normalization) and the Zod schemas were run and tested. The parts that need Next.js, argon2 and your MySQL database (route handlers, pages, the service tests, the smoke test) were written and type-checked but **have not been run against the real stack**. Steps 5 to 7 below are what prove Phase 2 works. Do not start Phase 3 until they pass.

## What Phase 2 adds

| Area | Files |
|---|---|
| Database | `instructor_sessions` table (one additive migration; no existing table changes) |
| API | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Pages | `/` (public entry), `/login`, `/register`, `/dashboard` (protected placeholder) |
| Libraries | `src/lib/{auth,session,validation,security,rate-limit,normalize,errors,api,post-json}.ts` |
| Service | `src/services/auth.service.ts` |
| UI | `src/components/auth/*`, `src/components/layout/logout-button.tsx` |
| Tests | `tests/unit/*`, `tests/validation.test.ts`, `tests/auth.service.test.ts`, `scripts/smoke-auth.mjs` |

Not included (later phases): student sessions, classrooms, activities, the real dashboard, sidebar navigation, password reset, e-mail verification.

## Before you start

Phase 1 must be working: `npm run db:verify` ends with `46 passed, 0 failed`.

## 1. New dependencies

```bash
npm install --save-exact zod@4 argon2
npx shadcn@latest add button input label card alert
```

| Package | Why |
|---|---|
| `zod@4` | Input validation required by the specification. The code uses the Zod 4 API (`z.email()`), so keep the `@4` tag |
| `argon2` | Argon2id password hashing. It is a native module that ships prebuilt binaries for Windows, macOS and Linux. Next.js already treats it as an external package, so no `next.config.ts` change is needed |
| shadcn components | The forms use `button`, `input`, `label`, `card`, `alert`. The CLI generates them in `src/components/ui/` and installs their small dependencies |

No test framework is added: tests use Node's built-in runner through `tsx`, which you already have.

If `argon2` fails to install on a teammate's machine, only `src/lib/auth.ts` (two functions) needs to change to use another algorithm such as bcrypt.

## 2. Configuration check (no new environment variables)

1. Open `next.config.ts`. If it contains `cacheComponents: true`, remove it (or set it to `false`). With Cache Components on, pages that read cookies fail with an error about uncached data outside `<Suspense>`.
2. `.env` needs nothing new. Sessions use random tokens, so there is no signing secret to manage.

## 3. Add the Phase 2 files

Copy the package contents into the project root, keeping the same paths. These existing files are **modified** (additive changes only; a patch is provided in `phase2-changes-to-existing-files.patch`):

| File | Change |
|---|---|
| `prisma/schema.prisma` | + `sessions` relation on `Instructor`, + `InstructorSession` model |
| `scripts/verify-phase1.ts` | Tolerates the known `instructor_sessions` table. Check count unchanged (46) |
| `src/app/page.tsx` | Replaces the default create-next-app home page with a small public entry page |
| `docs/PHASE1_DESIGN.md`, `docs/erd.mmd`, `docs/erd.png`, `README-PHASE1.md` | Documentation updated for the new table |

Then add the npm scripts:

```bash
npm pkg set "scripts.test=tsx --test --test-reporter=spec \"tests/**/*.test.ts\""
npm pkg set "scripts.test:unit=tsx --test --test-reporter=spec \"tests/unit/**/*.test.ts\""
npm pkg set "scripts.smoke:auth=node scripts/smoke-auth.mjs"
```

## 4. Create the sessions table (migration; the database is NOT reset)

```bash
npm run db:migrate -- --name add_instructor_sessions
npm run db:generate
```

Before accepting it, open `prisma/migrations/<timestamp>_add_instructor_sessions/migration.sql`. It must contain only a `CREATE TABLE` for `instructor_sessions` (with its indexes) and one `ADD CONSTRAINT ... FOREIGN KEY` to `instructors`. **If it contains `DROP` or `ALTER` on any other table, stop and tell me.** Do not use `db:init` and do not reset the database.

Then:

```bash
npm run db:status      # Database schema is up to date!
npm run db:verify      # still: 46 passed, 0 failed
```

## 5. Automated tests

```bash
npm run test:unit      # 28 tests, no database needed
npm test               # 60 tests: 28 unit + 14 validation + 18 database integration
```

`npm test` first removes any leftover `phase2-` accounts, runs, and removes its own accounts again. It exercises: successful registration, duplicate e-mail (including simultaneous requests), invalid login, successful login, unknown-e-mail vs wrong-password responses, session creation, expired / forged / logged-out sessions, and the time-zone round trip of session timestamps.

## 6. End-to-end smoke test (needs the app running)

```bash
# terminal 1
npm run dev

# terminal 2
npm run smoke:auth
```

28 checks against the real HTTP endpoints: unauthorized access, CSRF rejection, validation errors, cookie attributes, logout really invalidating the old cookie, protected-page redirects, and the login throttle. It ends with `AUTH SMOKE TEST PASSED`. To test from another device: `BASE_URL=http://<host-ip>:3000 npm run smoke:auth`.

## 7. Manual check in the browser (2 minutes)

1. Open `http://localhost:3000`, choose *Create instructor account*, register. You land on the dashboard greeting you by name.
2. Reload the page: you stay signed in.
3. Open `http://localhost:3000/dashboard` in a private window: you are sent to the login page.
4. Click *Log out*. Press the browser Back button: you do not see the dashboard.
5. Try to sign in with a wrong password: one generic message, and nothing says whether the e-mail exists.
6. Register again with the same e-mail: a clear "already exists" message on the e-mail field.

## Cleaning up test accounts

The automated tests clean up after themselves. The smoke test cannot (there is no delete-account feature); `npm test` removes its leftovers, or run this in MySQL:

```sql
DELETE FROM instructors WHERE email LIKE 'phase2-%@example.test';
```

Sessions are removed with their account automatically.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Module not found: @/components/ui/button` | Run the `shadcn add` command from step 1 |
| `Property 'instructorSession' does not exist` / `Cannot find module ... generated/prisma/client` | Run `npm run db:generate` after the migration |
| `The table instructor_sessions does not exist` (P2021) | The migration from step 4 has not been applied |
| `uncached data ... outside of <Suspense>` | `cacheComponents` is still enabled; see step 2 |
| `npm test`: "timestamps round-trip ... time-zone problem" | The database driver and MySQL disagree about time zones, which would make sessions expire immediately or never. Tell me the exact message |
| `403 BAD_ORIGIN` when calling the API with curl or Postman | By design (CSRF defence). Send an `Origin` header equal to the site, e.g. `-H "Origin: http://localhost:3000"` |
| `429 TOO_MANY_ATTEMPTS` | 5 wrong passwords for one e-mail in 10 minutes. Wait, or restart the server (the counter is in memory) |
| Smoke test: `Cannot reach http://localhost:3000` | The app is not running; start `npm run dev` |
| Login works over `http://<LAN-IP>:3000` but the cookie is not kept | Should not happen: the cookie is only marked `Secure` when the request is HTTPS. If it does, send me the response headers |
| Dev server warns about blocked cross-origin requests from a LAN address | Next.js dev mode only. Add the address to `allowedDevOrigins` in `next.config.ts`. Not needed for `next start` |
