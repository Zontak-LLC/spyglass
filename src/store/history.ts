import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { NightEvent } from "../parser/index.js";

/**
 * The history: every event the watcher found, in one SQLite file, plus where each log file was read up to. The board
 * is built from events alone, so after a restart the stored events are applied again and the board is the same
 * (main sessions, background agents and their steps all come from them). The ONLY place that writes to disk.
 * Rows from older versions that read workflow journals (issue 28) are skipped on replay, never applied; the 30-day
 * prune removes them.
 *
 * Nothing lost: a file is read on from its saved offset. Nothing doubled: an event is stored under a key that names the
 * file, its identity (inode and epoch) and where its line ends, so reading a line again changes nothing.
 * ":memory:" gives a throwaway database (the tests use it).
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_session ON events (session_id, ts);
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  ino INTEGER NOT NULL,
  epoch INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
`;

export type FileState = { ino: number; epoch: number; offset: number };
export const DEFAULT_KEEP_DAYS = 30;
/** Rows older versions stored from workflow journals (issue 28): never applied again. */
const JOURNAL_KINDS = new Set(["run.launched", "run.queue", "agent.started", "agent.result"]);
/** One day in ms: the keep window is counted in days. */
export const DAY_MS = 86_400_000;
/** The history holds prompts, paths and tool steps: no other account on the computer may read it. */
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const SIDE_FILES = ["-wal", "-shm"];

/** Sets `mode` on `path`; throws an Error naming the path and the mode when it cannot. */
function setMode(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot make ${path} private (mode ${mode.toString(8)}): ${why}`);
  }
}

/**
 * Makes the history folder 0700 and the database with its -wal/-shm files 0600 on every open, so an install made
 * with looser modes (or under a loose umask) is fixed on its next start. A missing -wal/-shm file is skipped.
 */
function makePrivate(dbPath: string): void {
  setMode(dirname(dbPath), PRIVATE_DIR_MODE);
  setMode(dbPath, PRIVATE_FILE_MODE);
  for (const side of SIDE_FILES) {
    if (existsSync(dbPath + side)) setMode(dbPath + side, PRIVATE_FILE_MODE);
  }
}

export class History {
  private readonly db: DatabaseSync;
  private closed = false;

  /** Opens (or makes) the history at `path`; throws, naming the path, when its folder or files cannot be made private. */
  constructor(path: string) {
    const isFile = path !== ":memory:";
    if (isFile) mkdirSync(dirname(path), { recursive: true, mode: PRIVATE_DIR_MODE });
    this.db = new DatabaseSync(path);
    if (isFile) this.openFile(path);
    this.db.exec(SCHEMA);
  }

  /** WAL for a file on disk, then the private modes; the database is closed again when they cannot be set. */
  private openFile(path: string): void {
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    try {
      makePrivate(path);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  /** Stores one event; false when this exact line was stored before (the caller then must not apply it again). */
  add(event: NightEvent, key: string, nowMs = Date.now()): boolean {
    const at = Date.parse(event.at); // a line with no time: use the time we saw it
    const ts = Number.isFinite(at) ? at : nowMs;
    const done = this.db
      .prepare("INSERT OR IGNORE INTO events (key, session_id, ts, kind, data) VALUES (?, ?, ?, ?, ?)")
      .run(key, event.sessionId, ts, event.kind, JSON.stringify(event));
    return Number(done.changes) === 1;
  }

  /**
   * Every stored event, oldest stored first: the order they arrived in, which is the order the board needs. Old
   * pipeline rows are skipped and not counted: the journal kinds, and every step of an agent a journal started
   * (collected first, so a step stored before its start is skipped too). Without that, such an agent's old steps
   * would show as a background agent.
   */
  replay(each: (event: NightEvent) => void): number {
    const pipeline = this.pipelineAgents();
    let n = 0;
    for (const row of this.db.prepare("SELECT kind, data FROM events ORDER BY id").iterate()) {
      try {
        if (JOURNAL_KINDS.has(String(row.kind))) continue;
        const event = JSON.parse(String(row.data)) as NightEvent;
        if (event.agentId && pipeline.has(event.agentId)) continue;
        each(event);
        n++;
      } catch {
        // a damaged row is skipped, never fatal
      }
    }
    return n;
  }

  /** The agent ids of every stored `agent.started` row (a ticket's agent or a helper with no number alike). */
  private pipelineAgents(): Set<string> {
    const ids = new Set<string>();
    for (const row of this.db.prepare("SELECT data FROM events WHERE kind = 'agent.started'").iterate()) {
      try {
        const id = (JSON.parse(String(row.data)) as { agentId?: unknown }).agentId;
        if (typeof id === "string") ids.add(id);
      } catch {
        // a damaged row names no agent
      }
    }
    return ids;
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n);
  }

  file(path: string): FileState | null {
    const row = this.db.prepare("SELECT ino, epoch, offset FROM files WHERE path = ?").get(path) as
      | FileState
      | undefined;
    return row ? { ino: Number(row.ino), epoch: Number(row.epoch), offset: Number(row.offset) } : null;
  }

  saveFile(path: string, mark: FileState, nowMs = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO files (path, ino, epoch, offset, updated) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (path) DO UPDATE SET ino = excluded.ino, epoch = excluded.epoch, offset = excluded.offset,
           updated = CASE WHEN excluded.ino = ino AND excluded.epoch = epoch AND excluded.offset = offset
                          THEN updated ELSE excluded.updated END`,
      )
      .run(path, mark.ino, mark.epoch, mark.offset, nowMs);
  }

  /**
   * Forgets sessions whose newest event is older than `keepDays` (a session goes whole, so a long one is never cut in
   * the middle) and the marks of files not read for that long. Returns how many events went.
   */
  prune(keepDays = DEFAULT_KEEP_DAYS, nowMs = Date.now()): number {
    const cutoff = nowMs - keepDays * DAY_MS;
    const gone = this.db
      .prepare(
        "DELETE FROM events WHERE session_id IN (SELECT session_id FROM events GROUP BY session_id HAVING MAX(ts) < ?)",
      )
      .run(cutoff);
    this.db.prepare("DELETE FROM files WHERE updated < ?").run(cutoff);
    return Number(gone.changes);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
