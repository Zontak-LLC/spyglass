// The watcher keeps state only for logs that are still there and changed within the keep window, so a month of
// sessions does not keep a month of followed files in memory.
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startEngine } from "../src/engine.js";
import type { NightEvent } from "../src/parser/index.js";
import { backlogTracker, watchLogs } from "../src/watcher/index.js";
import { DAY_MS, HOUR_MS } from "./board-events.js";

const toolUse = (sessionId: string, id: string, at = new Date().toISOString(), pad = "") =>
  `${JSON.stringify({
    sessionId,
    cwd: "/work/demo-app",
    gitBranch: "main",
    timestamp: at,
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `/work/demo-app/${id}.ts${pad}` } }],
    },
  })}\n`;
/** About 320 KB of steps: more than the 256 KB tail a returning quiet log is read from. */
const bigBody = (sessionId: string, at?: string) =>
  Array.from({ length: 160 }, (_, i) => toolUse(sessionId, `pad-${i}`, at, "x".repeat(2_000))).join("");
const stepIds = (events: NightEvent[]) => events.flatMap((e) => (e.kind === "tool.use" ? [e.toolUseId] : []));
const until = async (check: () => boolean, tries = 200) => {
  for (let n = 0; n < tries && !check(); n++) await new Promise((r) => setTimeout(r, 20));
  return check();
};

let dir = "";
let stop: () => void = () => {};
afterEach(() => {
  stop();
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});
const setup = () => {
  dir = mkdtempSync(join(tmpdir(), "spyglass-forget-"));
  mkdirSync(join(dir, "demo-app"));
  return join(dir, "demo-app");
};

describe("a developer deletes old session logs while Spyglass watches", () => {
  it("forgets a deleted log on the next look, and its backlog is dropped with it", async () => {
    const project = setup();
    const kept = join(project, "s-kept.jsonl");
    const gone = join(project, "s-gone.jsonl");
    writeFileSync(kept, toolUse("s-kept", "k1"));
    writeFileSync(gone, toolUse("s-gone", "g1"));
    const events: NightEvent[] = [];
    const forgotten: string[] = [];
    const backlog = backlogTracker();
    stop = watchLogs({
      root: dir,
      everyMs: 20,
      onEvent: (e) => events.push(e),
      onPlace: backlog.place,
      onForget: (path) => {
        forgotten.push(path);
        backlog.forget(path);
      },
    });
    expect(await until(() => stepIds(events).length === 2)).toBe(true);
    rmSync(gone);
    expect(await until(() => forgotten.length > 0)).toBe(true);
    expect(forgotten).toEqual([gone]);

    backlog.place(kept, 0); // as if the watcher had fallen behind on the kept log
    expect(backlog.check(Date.now())?.path).toBe(kept);
    backlog.forget(kept);
    expect(backlog.check(Date.now())).toBeNull();
  });
});

describe("a session log goes quiet past the keep window, then grows again", () => {
  it("is forgotten, then only its last 256 KB is read; a new small log is still read whole", async () => {
    const project = setup();
    const log = join(project, "s-quiet.jsonl");
    writeFileSync(log, toolUse("s-quiet", "first"));
    const events: NightEvent[] = [];
    const forgotten: string[] = [];
    stop = watchLogs({
      root: dir,
      everyMs: 20,
      forgetAfterMs: 60_000,
      onEvent: (e) => events.push(e),
      onForget: (path) => forgotten.push(path),
    });
    expect(await until(() => stepIds(events).includes("first"))).toBe(true);
    const quietSince = new Date(Date.now() - 5 * 60_000);
    utimesSync(log, quietSince, quietSince);
    expect(await until(() => forgotten.includes(log))).toBe(true);

    appendFileSync(log, bigBody("s-quiet") + toolUse("s-quiet", "last"));
    expect(await until(() => stepIds(events).includes("last"))).toBe(true);
    expect(stepIds(events).filter((id) => id === "first")).toHaveLength(1); // never read again
    expect(stepIds(events)).not.toContain("pad-0"); // the start of what grew is older than the tail
    expect(stepIds(events)).toContain("pad-159");

    writeFileSync(join(project, "s-new.jsonl"), toolUse("s-new", "n1") + toolUse("s-new", "n2"));
    expect(await until(() => stepIds(events).includes("n2"))).toBe(true);
    expect(stepIds(events)).toContain("n1");
  });
});

describe("Spyglass runs for a month over a quiet log", () => {
  it("forgets the quiet session from the board, history and watcher, and reads only the end when it comes back", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const project = setup();
    const log = join(project, "s-month.jsonl");
    writeFileSync(log, toolUse("s-month", "first"));
    const fresh: string[] = [];
    const engine = startEngine({
      root: dir,
      dbPath: ":memory:",
      everyMs: 60_000,
      onNew: (e) => fresh.push(...stepIds([e])),
    });
    stop = engine.stop;
    await new Promise((r) => setImmediate(r)); // the first look
    expect(fresh).toEqual(["first"]);
    expect(engine.board.size().sessions).toBe(1);

    vi.setSystemTime(Date.now() + 31 * DAY_MS);
    vi.advanceTimersByTime(HOUR_MS); // a look every minute, and the hourly forget
    expect(engine.board.size()).toEqual({ sessions: 0, agents: 0, desks: 0, places: 0, tokenEntries: 0 });
    expect(engine.history.count()).toBe(0);

    const now = new Date();
    appendFileSync(log, bigBody("s-month", now.toISOString()) + toolUse("s-month", "last", now.toISOString()));
    utimesSync(log, now, now); // the fake clock's "now": it changed just now
    vi.advanceTimersByTime(60_000);
    expect(fresh).toContain("last");
    expect(fresh).not.toContain("pad-0");
    expect(fresh.filter((id) => id === "first")).toHaveLength(1);
    expect(engine.board.size().sessions).toBe(1);
  });
});
