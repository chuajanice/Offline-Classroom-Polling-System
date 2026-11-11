// Minimal in-memory throttle for failed logins. Pure, no dependencies.
//
// Limits: MAX_FAILURES failed attempts per key within WINDOW_MS. A successful
// login clears the key. State lives in this Node process only (fine for the
// single-server, LAN deployment in the specification); a restart resets it.
//
// Trade-off: the key is the e-mail address, so anyone on the LAN who types a
// wrong password 5 times for an instructor's address blocks that address for
// the rest of the window. That is a short, visible nuisance; the alternative
// (no throttling) lets a student guess an instructor's password unchecked.

export class FailedAttemptLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(maxFailures = 5, windowMs = 10 * 60 * 1000, now: () => number = Date.now) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Is another attempt allowed right now? If not, how long until it is? */
  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const recent = this.recent(key);
    if (recent.length < this.maxFailures) return { allowed: true, retryAfterSeconds: 0 };
    const unblockAt = recent[0] + this.windowMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((unblockAt - this.now()) / 1000)) };
  }

  recordFailure(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.failures.set(key, recent);
    if (this.failures.size > 5000) this.prune();
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length === 0) this.failures.delete(key);
    return recent;
  }

  private prune(): void {
    for (const key of [...this.failures.keys()]) this.recent(key);
  }
}

// One shared instance per server process. Kept on globalThis so Next.js dev
// hot-reloads do not silently reset the counters.
const globalForLimiter = globalThis as unknown as { loginLimiter?: FailedAttemptLimiter };
export const loginLimiter: FailedAttemptLimiter =
  globalForLimiter.loginLimiter ?? (globalForLimiter.loginLimiter = new FailedAttemptLimiter());
