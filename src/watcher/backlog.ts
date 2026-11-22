// Has Lens fallen behind? A followed log is behind when it holds bytes Lens has not read (its size is past the
// watcher's read place). A log that is only touched (Claude Code does that to idle logs) has nothing unread.
import { statSync } from "node:fs";

/** One followed log as it was last checked: where the watcher's read got to, and since when bytes wait past it. */
export type BacklogEntry = { offset: number; sinceMs: number | null };
export type Backlog = ReadonlyMap<string, BacklogEntry>;
/** One followed log right now: its read place, and its size (null when it is gone). */
export type BacklogLook = { path: string; offset: number; size: number | null };

/**
 * The pure step: the previous state, what each log looks like now, and the time -> the next state. A log with
 * unread bytes keeps the `sinceMs` of the first check that saw it unread at that same offset; a moved offset
 * (Lens is catching up) starts the clock again, and a log read to its end clears it. A gone log is dropped.
 */
export function backlogStep(previous: Backlog, looks: BacklogLook[], nowMs: number): Map<string, BacklogEntry> {
  const next = new Map<string, BacklogEntry>();
  for (const { path, offset, size } of looks) {
    if (size === null) continue;
    if (size <= offset) {
      next.set(path, { offset, sinceMs: null });
      continue;
    }
    const before = previous.get(path);
    const waiting = before && before.offset === offset && before.sinceMs !== null ? before.sinceMs : nowMs;
    next.set(path, { offset, sinceMs: waiting });
  }
  return next;
}

/** The log whose unread bytes have waited longest, or null when every log is read to its end. */
export function oldestUnread(state: Backlog): { path: string; sinceMs: number } | null {
  let oldest: { path: string; sinceMs: number } | null = null;
  for (const [path, { sinceMs }] of state) {
    if (sinceMs !== null && (oldest === null || sinceMs < oldest.sinceMs)) oldest = { path, sinceMs };
  }
  return oldest;
}

export type BacklogTracker = {
  /** The watcher looked at `path` and its read place is `offset` (bytes read, a half-written line included). */
  place: (path: string, offset: number) => void;
  /** Sizes now (sync stats, so a stuck read cannot hang it) -> the log waiting longest, or null. */
  check: (nowMs: number) => { path: string; sinceMs: number } | null;
  /** The watcher forgot `path` (gone, or quiet for the keep window): drop its read place and its waiting time. */
  forget: (path: string) => void;
};

export function backlogTracker(): BacklogTracker {
  const offsets = new Map<string, number>();
  let state: Map<string, BacklogEntry> = new Map();
  const sizeOf = (path: string): number | null => {
    try {
      return statSync(path).size;
    } catch {
      return null; // gone (or its folder is): nothing waits to be read there
    }
  };
  return {
    place: (path, offset) => {
      offsets.set(path, offset);
    },
    check: (nowMs) => {
      const looks = [...offsets].map(([path, offset]) => ({ path, offset, size: sizeOf(path) }));
      for (const look of looks) if (look.size === null) offsets.delete(look.path);
      state = backlogStep(state, looks, nowMs);
      return oldestUnread(state);
    },
    forget: (path) => {
      offsets.delete(path);
      state.delete(path);
    },
  };
}
