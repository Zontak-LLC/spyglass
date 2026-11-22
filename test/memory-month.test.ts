// A busy month: 40 repositories, each with a session and a background agent every day, every step on new paths.
// Spyglass forgets what is quiet past the keep window each hour, as the engine does, so its memory stays flat.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Board, repoRootOf } from "../src/store/index.js";
import { ROOT_CACHE_MAX, rootCacheSize } from "../src/store/root.js";
import { DAY_MS, DAY_OF_WORK_SIZE, dayOfWork, fakeRootOf, HOUR_MS } from "./board-events.js";

const REPOS = 40;
const DAYS = 40;
const KEEP_MS = 30 * DAY_MS;
const START = Date.parse("2026-10-01T00:00:00.000Z");
const TIMED_RUNS = 9;
type Size = ReturnType<Board["size"]>;

/** The board's memory may hold at most what was active since the last cutoff: `active` days of work. */
const boundOf = (active: number): Size => ({
  sessions: active * DAY_OF_WORK_SIZE.sessions,
  agents: active * DAY_OF_WORK_SIZE.agents,
  desks: active * DAY_OF_WORK_SIZE.desks,
  places: active * DAY_OF_WORK_SIZE.places,
  tokenEntries: active * DAY_OF_WORK_SIZE.tokenEntries,
});

/** The median time (ms) of what a page pull costs: the project list, one board and the desks. */
function medianPullMs(board: Board, nowMs: number): number {
  const times: number[] = [];
  for (let run = 0; run < TIMED_RUNS; run++) {
    const start = performance.now();
    board.projects(nowMs);
    board.view("repo-0", nowMs);
    board.desks(nowMs, "/work/people/dev");
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(TIMED_RUNS / 2)] ?? 0;
}

/**
 * One simulated day: each hour some repositories do a day of work, then the board forgets as the engine does every
 * hour. Records when each piece of work happened; returns the last cutoff.
 */
function workOneDay(board: Board, day: number, workedAt: number[]): number {
  let cutoffMs = 0;
  for (let hour = 0; hour < 24; hour++) {
    const hourMs = START + (day - 1) * DAY_MS + hour * HOUR_MS;
    const atMs = hourMs + 5 * 60_000;
    for (let r = hour; r < REPOS; r += 24) {
      for (const e of dayOfWork(`repo-${r}`, `d${day}-r${r}`, new Date(atMs).toISOString())) board.apply(e);
      workedAt.push(atMs);
    }
    cutoffMs = hourMs + HOUR_MS - KEEP_MS;
    board.forget(cutoffMs);
  }
  return cutoffMs;
}

const FIELDS = ["sessions", "agents", "desks", "places", "tokenEntries"] as const;

describe("a developer runs Spyglass for 40 days across 40 repositories", () => {
  it("keeps every map in the store flat once the keep window is full", () => {
    const board = new Board(fakeRootOf);
    const workedAt: number[] = [];
    const sizes: Size[] = [];
    const pullMs = new Map<number, number>();
    for (let day = 1; day <= DAYS; day++) {
      const cutoffMs = workOneDay(board, day, workedAt);
      const bound = boundOf(workedAt.filter((at) => at >= cutoffMs).length);
      const size = board.size();
      for (const field of FIELDS) expect(size[field], `${field} on day ${day}`).toBeLessThanOrEqual(bound[field]);
      sizes[day] = size;
      if (day === 5 || day === DAYS) pullMs.set(day, medianPullMs(board, START + day * DAY_MS));
    }
    const day31 = sizes[31];
    const day40 = sizes[DAYS];
    expect(day31?.sessions).toBeGreaterThan(0);
    for (const field of FIELDS) expect(day40?.[field], field).toBeLessThanOrEqual(day31?.[field] ?? 0);
    expect(day40?.sessions).toBe(30 * REPOS); // exactly the last 30 days of work, nothing older
    // Written to the output only, never asserted: a slow CI runner must not turn this red.
    process.stdout.write(
      `median pull: day 5 ${pullMs.get(5)?.toFixed(2)} ms, day 40 ${pullMs.get(DAYS)?.toFixed(2)} ms\n`,
    );
  });
});

describe("a session touches thousands of different files", () => {
  const dir = mkdtempSync(join(tmpdir(), "spyglass-roots-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("still finds each file's repository, and the path cache never holds more than 5,000", () => {
    const repo = join(dir, "shop-app");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const home = join(dir, "home");
    const pathOf = (i: number) => join(repo, "src", `file-${i}.ts`);
    for (let i = 0; i < 6_000; i++) {
      expect(repoRootOf(pathOf(i), home)).toEqual({ root: repo, worktree: false });
    }
    expect(rootCacheSize()).toBeLessThanOrEqual(ROOT_CACHE_MAX);
    expect(repoRootOf(pathOf(0), home)).toEqual({ root: repo, worktree: false }); // evicted, looked up again
    expect(repoRootOf(join(dir, "loose.txt"), home)).toBeNull();
    expect(rootCacheSize()).toBe(ROOT_CACHE_MAX);
  });
});
