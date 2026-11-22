// Spyglass runs for months: what has been quiet longer than the keep window (30 days) is not replayed at start-up and
// leaves the board's memory, while everything newer stays exactly as it was.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startEngine } from "../src/engine.js";
import type { NightEvent } from "../src/parser/index.js";
import { Board, History } from "../src/store/index.js";
import { DAY_MS, dayOfWork, fakeRootOf, HOUR_MS, seen, step, titled, usage } from "./board-events.js";

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

describe("a developer restarts Spyglass over a history with a session quiet for a month", () => {
  let dir = "";
  let stop: () => void = () => {};
  afterEach(() => {
    stop();
    rmSync(dir, { recursive: true, force: true });
  });

  /** A history on disk holding these sessions, then the engine started over it (no logs to follow). */
  const startOver = (sessions: { id: string; repo: string; at: string }[]) => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-prune-"));
    const dbPath = join(dir, "data", "history.db");
    const history = new History(dbPath);
    for (const { id, repo, at } of sessions) {
      const who = { sessionId: id, at };
      const events = [seen(who, `/work/${repo}`), step(who, `t-${id}`, [`/work/${repo}/a.ts`])];
      for (const [n, e] of events.entries()) history.add(e, `${id}.jsonl#1.0@${n}.0`);
    }
    history.close();
    const engine = startEngine({ root: join(dir, "logs"), dbPath });
    stop = engine.stop;
    return engine;
  };

  it("replays only today's session: the one quiet for 31 days never reaches the board", () => {
    const engine = startOver([
      { id: "s-old", repo: "old-app", at: daysAgo(31) },
      { id: "s-today", repo: "new-app", at: daysAgo(0) },
    ]);
    expect(engine.board.projects().map((p) => p.project)).toEqual(["new-app"]);
    expect(engine.board.size().sessions).toBe(1);
    expect(engine.history.count()).toBe(2); // the old session's two events left the history too
  });

  it("replays a session quiet for 29 days, and forgets it once it passes 30", () => {
    const engine = startOver([{ id: "s-month", repo: "month-app", at: daysAgo(29) }]);
    expect(engine.board.projects().map((p) => p.project)).toEqual(["month-app"]);
    engine.board.forget(Date.now() + 2 * DAY_MS - 30 * DAY_MS); // the hourly forget, two days later
    expect(engine.board.projects()).toEqual([]);
    expect(engine.board.size().sessions).toBe(0);
  });
});

describe("the board forgets what has been quiet past the cutoff", () => {
  const NOW = Date.parse("2026-11-22T12:00:00.000Z");
  const OLD = "2026-10-20T09:00:00.000Z";
  const RECENT = "2026-11-22T11:50:00.000Z";
  const HOME = "/work/people/dev"; // an invented home folder, shown as `~` on the desks
  const boardOf = (events: NightEvent[]) => {
    const board = new Board(fakeRootOf);
    for (const e of events) board.apply(e);
    return board;
  };

  it("drops an old session, its agent and their desks, and leaves the newer ones field for field", () => {
    const board = boardOf([...dayOfWork("old-app", "old", OLD), ...dayOfWork("new-app", "new", RECENT)]);
    const before = board.size();
    const viewBefore = board.view("new-app", NOW);
    const desksBefore = board.desks(NOW, HOME);
    expect(board.deskTokens("main:s-old")?.total).toBe(2 * 116);

    board.forget(NOW - 30 * DAY_MS);

    expect(board.size()).toEqual({
      sessions: before.sessions - 1,
      agents: before.agents - 1,
      desks: before.desks - 2,
      places: before.places - 2,
      tokenEntries: before.tokenEntries - 3,
    });
    expect(board.size()).toEqual({ sessions: 1, agents: 1, desks: 2, places: 2, tokenEntries: 3 });
    expect(board.deskTokens("main:s-old")).toBeNull();
    expect(board.deskTokens("agent:a-old")).toBeNull();
    expect(board.agentLabel("a-old")).toBeNull();
    expect(board.projects(NOW).map((p) => p.project)).toEqual(["new-app", "shared"]);
    expect(board.view("new-app", NOW)).toEqual(viewBefore);
    expect(board.desks(NOW, HOME)).toEqual(desksBefore);
    expect(board.deskTokens("main:s-new")?.total).toBe(2 * 116);
  });

  it("keeps an agent with no step yet while its session is kept, and forgets it with its session", () => {
    const parent = { sessionId: "s-parent", at: RECENT };
    const waiting = { sessionId: "s-parent", agentId: "a-waiting", at: "" };
    const board = boardOf([
      seen(parent, "/work/shop-app"),
      titled(parent, "Shop work"),
      usage(parent, "msg-p1"),
      seen(waiting, "/work/shop-app"),
      titled(waiting, "Reviewer"),
    ]);
    expect(board.size()).toMatchObject({ sessions: 1, agents: 1, desks: 2 });

    board.forget(NOW - 30 * DAY_MS);
    expect(board.size()).toMatchObject({ sessions: 1, agents: 1, desks: 2 });
    expect(board.agentLabel("a-waiting")).toEqual({ project: "shop-app", name: "Reviewer" });

    board.forget(NOW + HOUR_MS); // its session has gone quiet past the cutoff now
    expect(board.size()).toEqual({ sessions: 0, agents: 0, desks: 0, places: 0, tokenEntries: 0 });
    expect(board.agentLabel("a-waiting")).toBeNull();
  });
});
