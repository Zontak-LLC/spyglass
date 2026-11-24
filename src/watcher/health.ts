/**
 * Is Lens keeping up? Stale = a followed log has had bytes Lens has not read (its size past the watcher's read place)
 * for more than `staleMs`, at the same read place: there was work and nobody read it. A log that is only touched
 * (Claude Code touches idle logs) has nothing unread, and neither does a quiet computer, however long it has been.
 * `backlog.ts` keeps the per-log clock; this is the pure verdict, so it is easy to test.
 */
export const STALE_MS = 30 * 60_000;

export type Health = {
  ok: boolean;
  status: "ok" | "stale";
  /** When the last whole line was read (ISO), or null when none was read since the start. For monitors only. */
  lastLineAt: string | null;
  /** When any log last changed (ISO), or null when there is none. For monitors only: a touch is not work. */
  lastChangeAt: string | null;
  /** Since when the longest-waiting log has had unread bytes (ISO), or null when every log is read to its end. */
  unreadSince: string | null;
};

type HealthInput = {
  lastLineMs: number | null;
  newestChangeMs: number | null;
  /** The oldest `sinceMs` from the backlog tracker, or null when nothing waits to be read. */
  unreadSinceMs: number | null;
  nowMs: number;
  staleMs?: number;
};

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function healthOf({
  lastLineMs,
  newestChangeMs,
  unreadSinceMs,
  nowMs,
  staleMs = STALE_MS,
}: HealthInput): Health {
  const stale = unreadSinceMs !== null && nowMs - unreadSinceMs > staleMs;
  return {
    ok: !stale,
    status: stale ? "stale" : "ok",
    lastLineAt: iso(lastLineMs),
    lastChangeAt: iso(newestChangeMs),
    unreadSince: iso(unreadSinceMs),
  };
}

export const WATCHDOG_EVERY_MS = 60_000;

/**
 * Looks at `check()` every `everyMs` and calls `onStale` once when it says stale. Lens froze twice (2026-11-01 and
 * 2026-11-07) with every file read stuck: Node's 4 file threads were all held by reads that never came back, so later
 * reads only waited in line. /health said "stale" for two days and nobody acted. Only a new process clears that,
 * so the CLI kills itself (SIGKILL) on `onStale` and the service (launchd KeepAlive) starts a fresh Lens.
 */
export function watchdog(check: () => Health, onStale: (health: Health) => void, everyMs = WATCHDOG_EVERY_MS) {
  let fired = false;
  const timer = setInterval(() => {
    if (fired) return;
    const health = check();
    if (health.ok) return;
    fired = true;
    onStale(health);
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
