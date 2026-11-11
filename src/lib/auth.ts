// Password hashing (Argon2id). The ONLY file that knows which algorithm is
// used: swapping to bcrypt later means changing just these functions.
import { randomBytes } from "node:crypto";
import { argon2id, hash as argon2Hash, verify as argon2Verify } from "argon2";

// OWASP-recommended Argon2id minimum (19 MiB, 2 passes, 1 lane): strong, yet
// light enough for a teacher's laptop that also serves a whole class.
const HASH_OPTIONS = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Returns a self-describing "$argon2id$..." string (salt and parameters included). */
export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, HASH_OPTIONS);
}

/** Never throws: a malformed stored hash simply fails verification. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(storedHash, plain);
  } catch {
    return false;
  }
}

// A valid hash of a random, unknowable password. Login verifies against it when
// the e-mail does not exist, so "unknown e-mail" and "wrong password" take the
// same time and cannot be told apart by timing.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
