# Phase 2 Design: Authentication

Scope (master prompt, section 20, Phase 2): instructor registration, password hashing, instructor login, secure session handling, logout, protected instructor pages, and server-side authorization checks. Student participant sessions belong to Phase 5.

## 1. How it fits the architecture

| Layer | Phase 2 code | Responsibility |
|---|---|---|
| Presentation | `src/app/(auth)/*`, `src/app/(instructor)/*`, `src/components/auth/*` | Forms, protected layout, logout button. No business rules |
| API | `src/app/api/auth/{register,login,logout,me}/route.ts` | CSRF check, parse body, call the service, map errors to JSON |
| Business logic | `src/services/auth.service.ts` | Register, authenticate, create / resolve / delete sessions. No HTTP, no cookies |
| Cross-cutting | `src/lib/{validation,auth,session,security,rate-limit,normalize,errors,api}.ts` | Zod schemas, Argon2id, cookies + authorization helpers, token / CSRF primitives, throttle, error types |
| Data access | `src/lib/prisma.ts` (Phase 1, reused unchanged) | One shared Prisma client |
| Database | `instructors` (Phase 1) + `instructor_sessions` (new) | |

`security.ts`, `rate-limit.ts`, `normalize.ts` and `errors.ts` have no dependencies, so they are unit-tested without Next.js or a database.

## 2. Why a sessions table

Section 6 requires server-side sessions with random identifiers and a logout that really ends the session. The nine primary tables have no place for that. Options considered:

| Option | Result |
|---|---|
| Signed stateless cookie (JWT style) | Rejected: cannot be revoked, so logout would only delete the browser's copy |
| In-memory store | Rejected: every restart logs everyone out; unreliable with Next.js dev reloads |
| **`instructor_sessions` table** | **Chosen.** Section 4 asks for nine *primary* tables; a supporting table is additive and touches nothing existing |

Columns: `id`, `instructor_id` (FK, ON DELETE CASCADE), `token_hash` (CHAR(64), UNIQUE), `created_at`, `expires_at`. See `docs/PHASE1_DESIGN.md` section 2.9.

## 3. Flows

**Register** `POST /api/auth/register`
1. Origin check (CSRF). 2. Parse JSON (type, size). 3. Zod validation and normalization. 4. Hash the password (Argon2id). 5. Insert the instructor; the unique index on `email` decides duplicates (race-safe) and yields 409. 6. Create a session and set the cookie. Response 201 `{ instructor }`.

**Login** `POST /api/auth/login`
1. Origin check. 2. Validate. 3. Throttle check for that e-mail (429 if blocked). 4. Look the instructor up and verify the password; when the e-mail does not exist, a dummy hash is verified instead so timing does not reveal it. 5. On failure: record it and answer the generic 401. 6. On success: clear the failure count, create a session, set the cookie. Response 200 `{ instructor }`.

**Every protected request**
Cookie value -> SHA-256 -> look up `instructor_sessions.token_hash` -> reject if missing or past `expires_at` (expired rows are deleted on sight) -> the instructor row is the identity for the rest of the request.

**Logout** `POST /api/auth/logout`
Origin check, delete the session row, send an expired cookie. Idempotent. A copied or stolen old cookie stops working immediately because the row is gone.

## 4. Security decisions

| Topic | Decision | Reason |
|---|---|---|
| Password hashing | Argon2id, 19 MiB / 2 passes / 1 lane (OWASP minimum) | Memory-hard; light enough for a teacher's laptop serving a class |
| Password policy | 8 to 128 characters, never trimmed | Length matters more than composition rules; upper bound stops oversized inputs reaching the hasher |
| Session token | 32 bytes from the OS CSPRNG (`crypto.randomBytes`), base64url | 256 bits, unguessable |
| Token storage | Only SHA-256 of the token is stored | A database leak does not yield usable sessions. A fast hash is fine for a high-entropy random token (unlike a password) |
| Session lifetime | 8 hours, absolute (no sliding renewal) | Covers a teaching day; limits a stolen cookie. Expired rows are purged on each login |
| Cookie `instructor_session` | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 8 h, `Secure` only when the request is HTTPS | HttpOnly blocks script access; Lax blocks cross-site POSTs. `Secure` over plain HTTP would make the browser drop the cookie and break login on a LAN |
| CSRF | Every POST requires an `Origin` (or `Referer`) header naming the same host; otherwise 403 | Browsers always send one on cross-site requests and scripts cannot forge it. Layered on SameSite=Lax. Applies to login and register too |
| Request hardening | JSON content type only (415), body capped at 10 000 characters (413), unknown JSON properties dropped by Zod | Blocks form-encoded CSRF tricks and oversized bodies; a client cannot smuggle an `id` or role |
| Account enumeration | Login returns the same status and message for "no such e-mail" and "wrong password", with equalized timing | Registration does reveal that an e-mail is taken; that is needed for a usable form |
| Brute force | 5 failed logins per e-mail per 10 minutes, then 429 + `Retry-After`; a successful login clears the count | A classroom LAN contains people who may try. In memory, resets on restart |
| Data exposure | The API and pages only ever use `{ id, fullName, email }`; `password_hash` is never selected for responses | |
| Errors | Expected failures are `AppError`s with a safe message; anything else is logged by name / code / first line only and shown as a generic 500 | Prisma error messages can embed query arguments |
| E-mail | Trimmed and lower-cased on every path (validation, service); the DB collation is case-insensitive as a second net | One account per address |

## 5. API reference

All responses are JSON with `Cache-Control: no-store`. All POSTs need `Content-Type: application/json` and a same-origin `Origin` header.

| Endpoint | Success | Failures |
|---|---|---|
| `POST /api/auth/register` body `{ fullName, email, password, confirmPassword }` | `201 { instructor }` + session cookie | `400 VALIDATION_ERROR` (with `fields`), `409 EMAIL_TAKEN`, `403`, `413`, `415` |
| `POST /api/auth/login` body `{ email, password }` | `200 { instructor }` + session cookie | `400`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS` (+ `Retry-After`), `403`, `413`, `415` |
| `POST /api/auth/logout` | `200 { ok: true }` + cleared cookie | `403` |
| `GET /api/auth/me` | `200 { instructor }` | `401 UNAUTHENTICATED` |

Error shape: `{ "error": { "code": "...", "message": "...", "fields": { "email": "..." } } }` (`fields` only for validation-type errors).

## 6. Rules for Phase 3 and later (how to protect new code)

1. **Identity comes only from the session.** Never read an instructor id from a body, query string or URL.
2. **Every API route** starts with `const instructor = await requireInstructorApi();` and passes `instructor.id` into the service. Ownership checks (does this classroom belong to `instructor.id`?) live in the services.
3. **Every instructor page that loads data** calls `await requireInstructor();` itself. The `(instructor)/layout.tsx` check protects the shell, but Next.js does not re-run a layout when navigating between sibling pages, so a page must not rely on it for data access.
4. **Every state-changing handler** (POST / PATCH / DELETE) calls `assertSameOrigin(request)` first and uses `parseOrThrow(schema, body)`.
5. Wrap handler bodies in `try { ... } catch (e) { return errorResponse(e); }`.

Student endpoints (Phase 5) use a separate cookie and token (`participants.session_token_hash`) and must never accept the instructor cookie.

## 7. Known limitations and decisions for the team

| Topic | Detail |
|---|---|
| **Plain HTTP on the LAN** | The specification runs the app on a classroom network, normally over HTTP. Passwords and session cookies then travel unencrypted and can be captured by someone sniffing the same Wi-Fi. The code already sets `Secure` automatically when served over HTTPS; serving the app over HTTPS (for example behind a reverse proxy with a local certificate) is the real fix. Decide this before the system is used with real classes |
| **Open registration** | Anyone who can reach the site can create an instructor account (the specification defines no approval step). Instructors only ever see their own data, but students could create accounts. If this matters, a shared "registration code" in `.env` is a small addition |
| Throttle scope | Keyed by e-mail only (the server cannot trust client IPs). Someone can briefly block a given instructor's login by failing 5 times; the block lasts at most 10 minutes |
| No password reset / e-mail verification / change-password | Not in the specification; there is no e-mail server on an offline network |
| Sessions are not sliding | An instructor is signed out 8 hours after login, even if active |
| `getCurrentInstructor` runs one query per request | Memoised so a layout and page share it; acceptable at classroom scale |

## 8. Test matrix (master prompt section 21, "Authentication")

| Required test | Where |
|---|---|
| Successful registration | `tests/auth.service.test.ts` (public fields only, Argon2id hash, no plaintext); smoke: 201 + cookie |
| Duplicate email | service test (same and different letter case, and 4 simultaneous attempts); smoke: 409 |
| Invalid login | service test (wrong password, case-sensitive / untrimmed password, unknown e-mail identical to wrong password); smoke: 401 |
| Successful login | service test; smoke: 200, new cookie, `/api/auth/me` works |
| Unauthorized access | service test (missing / empty / garbage / oversized / forged / hash-as-token / expired / logged-out tokens); smoke: `/api/auth/me` 401, `/dashboard` redirects to `/login`, old cookie rejected after logout |
| Validation | `tests/validation.test.ts` (14 tests) |
| CSRF, cookie flags, throttle | `tests/unit/security.test.ts`, `tests/unit/rate-limit.test.ts`; smoke sections 2, 3, 7 |
