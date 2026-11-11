# Phase 1: Foundation (database layer)

Start here. Design details are in `docs/PHASE1_DESIGN.md`.

**Status of these files:** written and statically checked (schema lint against the specification, TypeScript type-check, ERD rendered, migration helper tested). They have **not yet been run against a real MySQL server**; steps 6 to 8 below are what proves Phase 1 works. Do not start Phase 2 until step 8 prints `PHASE 1 READY`.

## Prerequisites

- Node.js (Prisma 7 needs 20.19+, 22.12+ or 24+; the specification asks for 26, see note below) and npm
- MySQL 8.4 server running locally, plus the `mysql` command-line client (or MySQL Workbench)

## 1. Create the Next.js app

```bash
npx create-next-app@latest offline-classroom-polling --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd offline-classroom-polling
```

If the CLI rejects a flag, run `npx create-next-app@latest offline-classroom-polling` and answer the prompts: TypeScript yes, ESLint yes, Tailwind yes, `src/` directory yes, App Router yes, import alias `@/*`.

## 2. UI foundation

```bash
npx shadcn@latest init
npm install lucide-react
```

(`lucide-react` is usually added by shadcn already; the second command is then a no-op.)

## 3. Database dependencies (pin Prisma to version 7)

```bash
npm install --save-exact @prisma/client@7 @prisma/adapter-mariadb@7
npm install --save-dev --save-exact prisma@7 tsx dotenv @types/node
npx prisma -v
```

Do **not** run a bare `npm install prisma`: the `latest` tag is now Prisma 8 (a release candidate with no MySQL write support). `npx prisma -v` must show a `7.x` CLI and a `7.x` client, matching each other.

Later phases add: `zod` and `argon2` (Phase 2), `pdf-lib` (Phase 7), a test runner (Phase 8).

## 4. Add the Phase 1 files

Copy from this package into the project root, keeping the same paths:

```
prisma/schema.prisma
prisma/check-constraints.sql
prisma.config.ts
src/lib/prisma.ts
scripts/mysql-setup.sql
scripts/append-checks.mjs
scripts/verify-phase1.ts
.env.example
docs/
```

Then:

```bash
# keep .env.example in git, ignore the generated client
printf '\n!.env.example\nsrc/generated/\n' >> .gitignore

# npm scripts
npm pkg set "scripts.db:validate=prisma validate"
npm pkg set "scripts.db:generate=prisma generate"
npm pkg set "scripts.db:init=prisma migrate dev --name init --create-only && node scripts/append-checks.mjs && prisma migrate dev && prisma generate"
npm pkg set "scripts.db:migrate=prisma migrate dev"
npm pkg set "scripts.db:status=prisma migrate status"
npm pkg set "scripts.db:studio=prisma studio"
npm pkg set "scripts.db:verify=tsx scripts/verify-phase1.ts"
```

Tell ESLint to skip generated code: in `eslint.config.mjs`, add `"src/generated/**"` to the ignore list (`globalIgnores([...])`).

## 5. Create the databases and the MySQL user

1. Open `scripts/mysql-setup.sql` and replace `CHANGE_ME_strong_password` (it appears once, in the `CREATE USER` line) with a strong password.
2. Run it as a MySQL administrator:

```bash
# macOS / Linux / Windows cmd
mysql -u root -p < scripts/mysql-setup.sql
```

PowerShell does not support `<`; use `Get-Content scripts/mysql-setup.sql | mysql -u root -p`, or paste the file into MySQL Workbench.

3. Create your environment file and put the same password in both URLs (percent-encode special characters, e.g. `@` becomes `%40`):

```bash
cp .env.example .env
```

## 6. Validate the schema

```bash
npm run db:validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

## 7. Create the tables (migration)

```bash
npm run db:init
```

This runs four steps in order: generate the migration SQL without applying it; append the CHECK constraints to it; apply it to `offline_polling_db`; generate the Prisma client into `src/generated/prisma`. Afterwards:

```bash
npm run db:status
```

Expected: `Database schema is up to date!`.

`db:init` is only for the very first migration. For any later schema change use `npm run db:migrate -- --name <what_changed>` followed by `npm run db:generate`.

## 8. Verify Phase 1

```bash
npm run db:verify
```

It checks the live database: the nine tables, 11 foreign keys with their delete rules, 9 unique indexes and 7 CHECK constraints; then CRUD, rejection of every invalid write, transaction rollback and attempt history. It removes its own test rows. Success ends with:

```
PHASE 1 READY - database layer verified.
```

You can also look at the data with `npm run db:studio`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npx prisma -v` shows 8.x | Prisma 8 got installed. Re-run step 3 with the `@7` tags; delete `node_modules` and `package-lock.json` first if needed |
| `P1000 Authentication failed` | Wrong user/password in `.env`, or special characters not percent-encoded |
| `P1001 Can't reach database server` | MySQL is not running, or not on port 3306 |
| `Access denied ... database 'offline_polling_shadow'` | `scripts/mysql-setup.sql` was not run, or ran without the shadow database grant |
| `RSA public key is not available client side` | `allowPublicKeyRetrieval` missing from `src/lib/prisma.ts` (it is included in the supplied file) |
| `datasource.url` missing / env var not found | `.env` is missing, or the command was not run from the project root |
| `db:init` stops after the first step | Re-run only the remaining steps: `node scripts/append-checks.mjs`, then `npx prisma migrate dev`, then `npx prisma generate` |
| Prisma says a migration was modified after being applied | `append-checks.mjs` was run after the migration was applied. Drop and recreate the dev database, delete `prisma/migrations`, and run `npm run db:init` again |

## Notes

- **Node 26**: the specification asks for Node 26, but Prisma's documented support list is `^20.19`, `^22.12` and `^24`. It is expected to work (Prisma tests all active LTS releases) but this has not been confirmed. If `npx prisma -v` fails on Node 26, develop on Node 24 LTS.
- **Next.js 16.4+** enables *Cache Components* by default in new apps. This application reads live database state and cookies on nearly every request, so the simpler default rendering model is a better fit. If the generated `next.config.ts` contains `cacheComponents: true`, remove it (or set it to `false`) before Phase 2.

## After Phase 1

Phase 2 (authentication) is documented in `README-PHASE2.md`. It adds one supporting table, `instructor_sessions`; `npm run db:verify` keeps passing before and after that migration.
