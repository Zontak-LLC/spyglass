import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { type Engine, startEngine } from "../src/engine.js";
import type { Desk, DesksView } from "../src/store/index.js";

// Shared by the desks tests. The fixtures in test/fixtures/desks/ have the shape of real Claude Code logs (a main
// session and one background agent); all names, ids and texts are invented. "/work" in them stands for
// a folder made per test.
const FIXTURES = join(import.meta.dirname, "fixtures", "desks");
export const SESSION = "s-desk-1";
export const NOW = Date.parse("2026-10-29T09:05:00.000Z");
export const RESET = 1_893_456_000; // a fixed future reset time, in Unix seconds
// The fixtures have fixed dates, so the default keep window would prune them once enough time passes.
const FIXTURE_KEEP_DAYS = 3650;

export const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return check();
};
export const deskOf = (view: DesksView, role: "main session" | "background agent") =>
  view.list?.find((d) => d.role === role);
export const deskById = (view: DesksView, id: string): Desk | undefined => view.list?.find((d) => d.id === id);

/** A fresh folder of logs per test, and an engine that follows them. */
export function useDeskLogs() {
  let base = "";
  let engine: Engine | null = null;

  const paths = () => {
    const project = join(base, "logs", "-work-shop-app");
    const subagents = join(project, SESSION, "subagents");
    return {
      root: join(base, "logs"),
      session: join(project, `${SESSION}.jsonl`),
      subagents,
      db: join(base, "ns.db"),
    };
  };
  /** A fixture with "/work" pointed at this test's folder. */
  const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8").replaceAll('"/work/', `"${base}/`);
  const line = (o: Record<string, unknown>) =>
    `${JSON.stringify({ sessionId: SESSION, cwd: `${base}/shop-app`, gitBranch: "coupon", userType: "external", ...o })}\n`;
  const limitLine = (timestamp: string, extra: Record<string, unknown> = {}) =>
    line({
      ...extra,
      type: "assistant",
      timestamp,
      isApiErrorMessage: true,
      error: "rate_limit",
      quotaLimits: { status: "rejected", resetsAt: RESET, rateLimitType: "five_hour" },
      message: { model: "<synthetic>", content: [{ type: "text", text: "You've hit your session limit" }] },
    });

  function writeLogs() {
    const p = paths();
    mkdirSync(p.subagents, { recursive: true });
    for (const repo of ["shop-app", "docs-site"]) mkdirSync(join(base, repo, ".git"), { recursive: true });
    writeFileSync(p.session, fixture("session.jsonl"));
    writeFileSync(join(p.subagents, "agent-bg1.jsonl"), fixture("agent-bg1.jsonl"));
    writeFileSync(join(p.subagents, "agent-bg1.meta.json"), fixture("agent-bg1.meta.json"));
  }

  const start = (): Engine => {
    engine = startEngine({ root: paths().root, dbPath: paths().db, everyMs: 40, keepDays: FIXTURE_KEEP_DAYS });
    return engine;
  };

  /** Starts the engine and waits for every desk and the agent's name (the watcher reads the meta file just after its log). */
  async function open(): Promise<Engine> {
    const started = start();
    await until(() => {
      const d = started.board.desks(NOW).list ?? [];
      return (
        d.length === 2 &&
        d.some((x) => x.title === "Docs: coupon field") &&
        d.every((x) => x.stepCount === 3 || x.stepCount === 4)
      );
    });
    return started;
  }

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), "spyglass-desks-")));
    writeLogs();
  });
  afterEach(() => {
    engine?.stop();
    engine = null;
    rmSync(base, { recursive: true, force: true });
  });

  return { base: () => base, paths, line, limitLine, start, open, stop: () => engine?.stop() };
}
