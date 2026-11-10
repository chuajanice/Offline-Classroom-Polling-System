// Prisma CLI configuration (Prisma ORM 7).
//
// In Prisma 7 the datasource URL is no longer declared in schema.prisma.
// The CLI (migrate, validate, studio, ...) reads it from here; the running
// application connects through the driver adapter in src/lib/prisma.ts.
//
// Environment variables are not loaded automatically by Prisma 7, hence the
// explicit dotenv import.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // A dedicated, pre-created shadow database means the MySQL user does not
    // need the global CREATE DATABASE privilege that `migrate dev` would
    // otherwise require (error P3014). See scripts/mysql-setup.sql.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
