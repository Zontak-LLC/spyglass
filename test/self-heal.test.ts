// Lens restarted itself 39 times a week on one computer and 103 on another for nothing: Claude Code touches idle
// logs, and "a log changed" counted as work. And once it did mean to restart, process.exit() got stuck for 13 hours.
// These scenarios keep both fixed: stale means bytes that wait unread, and a stale Lens really dies.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { startEngine } from "../src/engine.js";
import { startServer } from "../src/server/index.js";
import {
  advance,
  type Backlog,
  backlogStep,
  backlogTracker,
  healthOf,
  oldestUnread,
  START,
} from "../src/watcher/index.js";

const MIN = 60_000;
const NOW = Date.parse("2026-11-17T09:00:00Z");
const LOG = "/work/.claude/projects/demo-app/s1.jsonl";
const line = (id: string, file: string) =>
  `${JSON.stringify({
    sessionId: "s1",
    cwd: "/work/demo-app",
    timestamp: "2026-11-17T08:00:00.000Z",
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `/work/demo-app/${file}` } }] },
  })}\n`;
const until = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return check();
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// chmod 0 locks nobody out when running as root, and Windows has no such modes.
const canLock = process.platform !== "win32" && process.getuid?.() !== 0;

/** Checks the backlog once per entry of `looks` (one a minute) and gives the health at the last one. */
function healthAfter(looks: { offset: number; size: number | null }[][], lastLineMs: number | null = null) {
  let state: Backlog = new Map();
  const start = NOW - (looks.length - 1) * MIN;
  looks.forEach((files, i) => {
    state = backlogStep(
      state,
      files.map((f, n) => ({ path: `${LOG}.${n}`, ...f })),
      start + i * MIN,
    );
  });
  const unread = oldestUnread(state);
  return healthOf({ lastLineMs, newestChangeMs: NOW, unreadSinceMs: unread?.sinceMs ?? null, nowMs: NOW });
}

describe("stale means bytes nobody read, not a log that changed", () => {
  it("a log touched with no new line is not stale, even 2 hours after the last line read", () => {
    const touched = Array.from({ length: 121 }, () => [{ offset: 5_000, size: 5_000 }]);
    const health = healthAfter(touched, NOW - 120 * MIN);
    expect(health).toMatchObject({ ok: true, status: "ok", unreadSince: null });
    expect(health.lastChangeAt).toBe(new Date(NOW).toISOString()); // still told to monitors, but it decides nothing
  });

  it("a log whose bytes have waited at the same place for more than 30 minutes is stale, since it was first seen", () => {
    const stuck = Array.from({ length: 32 }, (_, i) => [{ offset: 5_000, size: 5_000 + 300 * (i + 1) }]);
    const health = healthAfter(stuck, NOW - 40 * MIN);
    expect(health).toMatchObject({ ok: false, status: "stale", unreadSince: new Date(NOW - 31 * MIN).toISOString() });
  });

  it("a log 40 minutes behind whose read place moved in the last check (catching up a backlog) is not stale", () => {
    const behind = Array.from({ length: 41 }, () => [{ offset: 1_000, size: 90_000_000 }]);
    behind.push([{ offset: 9_000_000, size: 90_000_000 }]);
    expect(healthAfter(behind)).toMatchObject({ ok: true, unreadSince: new Date(NOW).toISOString() });
  });

  it("a half-written last line (read into the partial buffer, no newline yet) is not unread", () => {
    const half = Buffer.from('{"type":"assistant","mess');
    const { state } = advance(START, half);
    expect(state.partial.length).toBe(half.length); // read, waiting for its end
    const looks = Array.from({ length: 40 }, () => [{ offset: state.offset, size: half.length }]);
    expect(healthAfter(looks)).toMatchObject({ ok: true, unreadSince: null });
  });

  it("a log that disappeared is dropped and does not make Lens stale", () => {
    const looks: { offset: number; size: number | null }[][] = Array.from({ length: 40 }, () => [
      { offset: 10, size: 20 },
    ]);
    looks.push([{ offset: 10, size: null }]);
    expect(healthAfter(looks)).toMatchObject({ ok: true, unreadSince: null });
  });

  it("the tracker reads sizes from the disk and forgets a deleted log", () => {
    const dir = mkdtempSync(join(tmpdir(), "lens-backlog-"));
    try {
      const log = join(dir, "s1.jsonl");
      writeFileSync(log, line("t1", "a.ts"));
      const tracker = backlogTracker();
      tracker.place(log, 0);
      expect(tracker.check(NOW)).toEqual({ path: log, sinceMs: NOW });
      expect(tracker.check(NOW + MIN)).toEqual({ path: log, sinceMs: NOW }); // same place: the clock keeps running
      rmSync(log);
      expect(tracker.check(NOW + 2 * MIN)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

let dir = "";
let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  rmSync(dir, { recursive: true, force: true });
});
const setup = () => {
  dir = mkdtempSync(join(tmpdir(), "lens-heal-"));
  mkdirSync(join(dir, "demo-app"));
  return join(dir, "demo-app", "s1.jsonl");
};

describe("the engine's /health", () => {
  it("stays ok (200) when Claude Code only touches a log Lens has read", async () => {
    const log = setup();
    const engine = startEngine({ root: dir, dbPath: ":memory:", everyMs: 10, staleMs: 100 });
    stops.push(engine.stop);
    writeFileSync(log, line("t1", "a.ts"));
    expect(await until(() => engine.health().lastLineAt !== null)).toBe(true);
    const touched = new Date();
    utimesSync(log, touched, touched); // a touch: a new mtime, not one new byte
    await wait(50);
    expect(engine.health().ok).toBe(true);
    const later = Date.now() + 1_000; // well past the stale window
    expect(engine.health(later)).toMatchObject({ ok: true, status: "ok", unreadSince: null });
    const server = await startServer(0, { view: () => ({}), projects: () => [], health: () => engine.health(later) });
    stops.push(() => void server.close());
    expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(200);
  });

  it.skipIf(!canLock)("says stale (503) when a log Lens placed gets bytes it cannot read", async () => {
    const log = setup();
    const engine = startEngine({ root: dir, dbPath: ":memory:", everyMs: 10, staleMs: 300 });
    stops.push(engine.stop);
    writeFileSync(log, line("t1", "a.ts"));
    expect(await until(() => engine.health().lastLineAt !== null)).toBe(true);
    const fd = openSync(log, "a"); // the session keeps its file open and goes on writing
    chmodSync(log, 0); // but Lens can no longer open it
    writeSync(fd, line("t2", "b.ts"));
    closeSync(fd);
    expect(await until(() => engine.health().unreadSince !== null)).toBe(true);
    expect(await until(() => !engine.health().ok)).toBe(true);
    expect(engine.health()).toMatchObject({ ok: false, status: "stale" });
    expect(engine.unread()?.path).toBe(log);
    const server = await startServer(0, { view: () => ({}), projects: () => [], health: () => engine.health() });
    stops.push(() => void server.close());
    expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(503);
    chmodSync(log, 0o600);
  });
});

/** A port nobody uses: listen on 0, note the port, close (0 itself would fall back to 4400). */
const freePort = () =>
  new Promise<number>((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
type Exit = { code: number | null; signal: NodeJS.Signals | null };
const exitWithin = (child: ChildProcess, ms: number) =>
  new Promise<Exit | null>((done) => {
    if (child.exitCode !== null || child.signalCode !== null) done({ code: child.exitCode, signal: child.signalCode });
    const timer = setTimeout(() => done(null), ms);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal });
    });
  });

describe.skipIf(!canLock)("the built command heals itself", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build", "--silent"], { encoding: "utf8" });
  }, 60_000);

  async function startLens() {
    dir = mkdtempSync(join(tmpdir(), "lens-cli-"));
    const logs = join(dir, "logs");
    mkdirSync(join(logs, "demo-app"), { recursive: true });
    const child = spawn(process.execPath, ["dist/cli.js"], {
      env: {
        ...process.env,
        SPYGLASS_LOGS: logs,
        SPYGLASS_DATA: join(dir, "data"),
        SPYGLASS_PORT: String(await freePort()),
        SPYGLASS_STALE_MS: "300",
        SPYGLASS_WATCHDOG_MS: "100",
      },
    });
    stops.push(() => child.kill("SIGKILL"));
    const out = { stdout: "", stderr: "" };
    child.stdout.on("data", (d: Buffer) => {
      out.stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      out.stderr += d.toString();
    });
    expect(await until(() => out.stdout.includes("Board:"), 10_000)).toBe(true);
    return { child, out, log: join(logs, "demo-app", "s1.jsonl") };
  }

  it("kills itself within 5 s once a log's bytes sit unread past the window", async () => {
    const { child, out, log } = await startLens();
    writeFileSync(log, line("t1", "a.ts"));
    chmodSync(log, 0); // bytes Lens can never read
    const exit = await exitWithin(child, 5_000);
    expect(out.stderr).toContain("has unread bytes since");
    expect(out.stderr).toContain("s1.jsonl");
    expect(exit).toEqual({ code: null, signal: "SIGKILL" });
  }, 60_000);

  it("keeps running when a log it has read is only touched", async () => {
    const { child, out, log } = await startLens();
    writeFileSync(log, line("t1", "a.ts"));
    expect(await until(() => out.stdout.includes("a.ts"))).toBe(true);
    for (let i = 0; i < 6; i++) {
      const now = new Date();
      utimesSync(log, now, now); // what Claude Code does to an idle log
      await wait(100);
    }
    await wait(300 + 3 * 100); // the stale window plus three watchdog ticks after the last touch
    expect({ code: child.exitCode, signal: child.signalCode }).toEqual({ code: null, signal: null });
    expect(out.stderr).not.toContain("has unread bytes");
    child.kill("SIGTERM");
    expect(await exitWithin(child, 5_000)).not.toBeNull();
  }, 60_000);
});
