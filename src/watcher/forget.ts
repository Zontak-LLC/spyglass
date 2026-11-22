// Which followed files the watcher may forget, so a month of logs does not keep a month of state in memory.

/** What one look found for each listed file: its facts, or null when it vanished between the listing and the look. */
export type Listed = ReadonlyMap<string, { mtimeMs: number } | null>;

/** A file last changed before `cutoffMs` is quiet; with no cutoff, nothing is. */
export function isQuiet(mtimeMs: number, cutoffMs: number | undefined): boolean {
  return cutoffMs !== undefined && mtimeMs < cutoffMs;
}

/**
 * The known paths to drop: those the listing no longer returns (or that vanished), and, when there is a cutoff, those
 * last changed before it. Pure: the caller does the listing and the stats.
 */
export function pathsToForget(known: Iterable<string>, listed: Listed, cutoffMs: number | undefined): string[] {
  const gone: string[] = [];
  for (const path of new Set(known)) {
    const info = listed.get(path);
    if (!info || isQuiet(info.mtimeMs, cutoffMs)) gone.push(path);
  }
  return gone;
}
