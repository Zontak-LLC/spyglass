// The engine: the watcher feeding the history and the board. The CLI adds the server and the terminal on top.
import type { NightEvent } from "./parser/index.js";
import { Board, DAY_MS, DEFAULT_KEEP_DAYS, History } from "./store/index.js";
import { backlogTracker, type Health, healthOf, newestChange, watchLogs } from "./watcher/index.js";

type EngineOptions = {
  /** Claude Code's projects folder. */
  root: string;
  /** The SQLite file, or ":memory:". */
  dbPath: string;
  keepDays?: number;
  everyMs?: number;
  /** A log with bytes left unread (at the same read place) for this long = stale (default 30 minutes). */
  staleMs?: number;
  /** A new event (never one seen before, never one replayed from the history). */
  onNew?: (event: NightEvent) => void;
  onError?: (error: unknown) => void;
};
export type Engine = {
  board: Board;
  history: History;
  /** For `/health`: when a line was last read, and whether Lens has fallen behind the logs. */
  health: (nowMs?: number) => Health;
  /** The log whose unread bytes waited longest at the last health check, or null (for the watchdog's error line). */
  unread: () => { path: string; sinceMs: number } | null;
  stop: () => void;
};

const HOUR_MS = 3_600_000;

/**
 * Opens the history, rebuilds the board from it, then follows the logs on from where each file was left. A database
 * that cannot be opened (damaged, no rights) is reported and the board runs without a history rather than not at all.
 */
export function startEngine(options: EngineOptions): Engine {
  const { root, dbPath, keepDays = DEFAULT_KEEP_DAYS, everyMs, staleMs, onNew, onError } = options;
  const backlog = backlogTracker();
  let unread: { path: string; sinceMs: number } | null = null;
  let lastLineMs: number | null = null;
  let history: History;
  try {
    history = new History(dbPath);
  } catch (error) {
    onError?.(
      new Error(`history unavailable (${error instanceof Error ? error.message : String(error)}); running without it`),
    );
    history = new History(":memory:");
  }
  const board = new Board();
  const keepMs = keepDays * DAY_MS;
  // Memory stays bounded: what has been quiet longer than the keep window is neither replayed nor kept. A session
  // whose own events are recent can still hold an agent quiet that long, so the board forgets after the replay too.
  const forgetBoard = () => board.forget(Date.now() - keepMs);
  history.prune(keepDays);
  history.replay((event) => board.apply(event));
  forgetBoard();
  const take = (event: NightEvent, key: string) => {
    if (!history.add(event, key)) return; // read before: the board already has it
    board.apply(event);
    onNew?.(event);
  };
  const stopWatching = watchLogs({
    root,
    ...(everyMs ? { everyMs } : {}),
    onEvent: (event, origin) => take(event, origin.key),
    resume: (path) => history.file(path),
    onRead: (path, mark) => history.saveFile(path, mark),
    onLines: () => {
      lastLineMs = Date.now();
    },
    onPlace: backlog.place,
    forgetAfterMs: keepMs,
    onForget: backlog.forget,
    ...(onError ? { onError } : {}),
  });
  // The watcher forgets gone and quiet files on each look itself; the history and the board are pruned hourly.
  const pruner = setInterval(() => {
    history.prune(keepDays);
    forgetBoard();
  }, HOUR_MS);
  pruner.unref();
  return {
    board,
    history,
    health: (nowMs = Date.now()) => {
      unread = backlog.check(nowMs);
      // newestChange only fills `lastChangeAt` for monitors: a touched log is not work, so it decides nothing.
      return healthOf({
        lastLineMs,
        newestChangeMs: newestChange(root),
        unreadSinceMs: unread?.sinceMs ?? null,
        nowMs,
        ...(staleMs ? { staleMs } : {}),
      });
    },
    unread: () => unread,
    stop: () => {
      stopWatching();
      clearInterval(pruner);
      history.close();
    },
  };
}
