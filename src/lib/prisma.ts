// Data Access Layer entry point: the single PrismaClient used by the app.
//
// Server-side only. Never import this file from a client component; student
// and instructor browsers must never reach MySQL directly.
//
// Relative imports (not the "@/" alias) are used on purpose so that this file
// also works from standalone scripts run with tsx (see scripts/).
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Builds the adapter options from DATABASE_URL so there is one source of truth
 * for the connection settings (the Prisma CLI reads the same variable).
 * Credentials are decoded, so passwords containing special characters work as
 * long as they are percent-encoded in the URL.
 */
function adapterConfigFromEnv() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const url = new URL(raw);
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must start with mysql://");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    // Headroom for a classroom of students submitting at about the same time.
    connectionLimit: 10,
    // MySQL 8.4 accounts default to caching_sha2_password. Over a plain
    // (non-TLS) connection the first login needs the server's RSA public key.
    // This is safe here because MySQL runs on the same machine as the app
    // (localhost); do not enable it for a remote database without TLS.
    allowPublicKeyRetrieval: true,
  };
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb(adapterConfigFromEnv());
  return new PrismaClient({ adapter });
}

// Next.js dev mode re-evaluates modules on every hot reload. Keep one client on
// globalThis so reloads do not leak connection pools.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
