// A history write that fails must not lose the event: the watcher keeps its read place and reads the line again.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startEngine } from "../src/engine.js";
import type { NightEvent } from "../src/parser/index.js";
import { History } from "../src/store/index.js";

const title = `${JSON.stringify({
  sessionId: "s1",
  cwd: "/work/demo-app",
  gitBranch: "main",
  timestamp: new Date().toISOString(),
  type: "ai-title",
  aiTitle: "Dark mode",
})}\n`;
const step = `${JSON.stringify({
  sessionId: "s1",
  cwd: "/work/demo-app",
  gitBranch: "main",
  timestamp: new Date().toISOString(),
  type: "assistant",
  message: { content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/work/demo-app/a.ts" } }] },
})}\n`;
const until = async (check: () => boolean, tries = 200) => {
  for (let n = 0; n < tries && !check(); n++) await new Promise((r) => setTimeout(r, 20));
  return check();
};

let dir = "";
let stop: () => void = () => {};
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("the database is busy for one write", () => {
  it("stores the step on the next look, once, and the board shows it once", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-lost-"));
    mkdirSync(join(dir, "demo-app"));
    writeFileSync(join(dir, "demo-app", "s1.jsonl"), title + step);
    const realAdd = History.prototype.add;
    let failed = false;
    vi.spyOn(History.prototype, "add").mockImplementation(function (this: History, event, key, nowMs) {
      if (event.kind === "tool.use" && !failed) {
        failed = true;
        throw new Error("database is locked");
      }
      return realAdd.call(this, event, key, nowMs);
    });
    const fresh: NightEvent[] = [];
    const errors: string[] = [];
    const engine = startEngine({
      root: dir,
      dbPath: join(dir, "history.db"),
      everyMs: 30,
      onNew: (e) => fresh.push(e),
      onError: (e) => errors.push(e instanceof Error ? e.message : String(e)),
    });
    stop = engine.stop;
    const onBoard = () => JSON.stringify(engine.board.view("demo-app")).split("Editing a.ts").length - 1;
    expect(await until(() => onBoard() > 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 200)); // more looks: nothing more may arrive
    const stored: NightEvent[] = [];
    engine.history.replay((e) => stored.push(e));
    expect(stored.filter((e) => e.kind === "tool.use")).toHaveLength(1);
    expect(failed).toBe(true);
    expect(onBoard()).toBe(1);
    expect(fresh.filter((e) => e.kind === "tool.use")).toHaveLength(1);
    expect(errors).toEqual(["database is locked"]);
  });
});
