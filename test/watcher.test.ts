import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NightEvent } from "../src/parser/index.js";
import { advance, logFiles, START, startAt, watchLogs } from "../src/watcher/index.js";

const line = (o: Record<string, unknown>) =>
  `${JSON.stringify({ sessionId: "s1", cwd: "/work/demo-app", gitBranch: "main", timestamp: "2026-10-23T22:00:00.000Z", ...o })}\n`;
const toolUse = (id: string, file: string) =>
  line({
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `/work/demo-app/${file}` } }] },
  });
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return check();
};

describe("following a growing file", () => {
  const b = (text: string) => Buffer.from(text, "utf8");

  it("hands back complete lines and keeps a half-written one until the rest arrives", () => {
    const a = advance(START, b('one\n{"ha'));
    expect(a.lines).toEqual(["one"]);
    const c = advance(a.state, b('lf"}\n'));
    expect(c.lines).toEqual(['{"half"}']);
    expect(c.state.offset).toBe(13); // 8 + 5 bytes
  });

  it("keeps a character whole when a read ends in the middle of it", () => {
    const euro = b("paid 5 €\n"); // the euro sign is 3 bytes
    const cut = euro.length - 2; // inside the euro sign
    const a = advance(START, euro.subarray(0, cut));
    const c = advance(a.state, euro.subarray(cut));
    expect([...a.lines, ...c.lines]).toEqual(["paid 5 €"]);
  });

  it("starting mid-file drops only the cut line, never a whole one", () => {
    const text = b("first\nsecond\nthird\n");
    const midLine = advance(startAt(3), text.subarray(2)); // starts inside "first"
    expect(midLine.lines).toEqual(["second", "third"]);
    const onBoundary = advance(startAt(6), text.subarray(5)); // starts exactly at "second"
    expect(onBoundary.lines).toEqual(["second", "third"]);
  });
});

// SPEC scenarios 1 and 2, live: a session starts and works; each step reaches the stream within 2 seconds.
describe("a developer runs Claude Code while Spyglass watches", () => {
  let dir = "";
  let stop: () => void = () => {};
  afterEach(() => {
    stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sees a new session and each new step as it is written, even a line written in two halves", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    mkdirSync(join(dir, "demo-app"));
    const events: NightEvent[] = [];
    stop = watchLogs({ root: dir, everyMs: 50, onEvent: (e) => events.push(e) });
    const log = join(dir, "demo-app", "s1.jsonl");
    writeFileSync(log, toolUse("t1", "a.ts"));
    expect(await until(() => events.some((e) => e.kind === "tool.use"))).toBe(true);
    const second = toolUse("t2", "b.ts");
    appendFileSync(log, second.slice(0, 40));
    await new Promise((r) => setTimeout(r, 200));
    appendFileSync(log, second.slice(40));
    expect(await until(() => events.filter((e) => e.kind === "tool.use").length === 2)).toBe(true);
    const summaries = events.flatMap((e) => (e.kind === "tool.use" ? [e.summary] : []));
    expect(summaries).toEqual(["Editing a.ts", "Editing b.ts"]);
  });

  it("follows a session log through 1,000 appends, whole lines and halves, with no read ever stuck", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    mkdirSync(join(dir, "demo-app"));
    const log = join(dir, "demo-app", "s1.jsonl");
    const summaries: string[] = [];
    const keys: string[] = [];
    const places: number[] = [];
    const errors: unknown[] = [];
    stop = watchLogs({
      root: dir,
      everyMs: 5,
      onEvent: (e, origin) => {
        if (e.kind !== "tool.use") return;
        summaries.push(e.summary);
        keys.push(origin.key);
      },
      onPlace: (_path, offset) => places.push(offset),
      onError: (e) => errors.push(e),
    });
    const caughtUp = () => until(() => places.at(-1) === statSync(log).size, 5000);
    for (let i = 0; i < 1_000; i++) {
      const text = toolUse(`t${i}`, `f${i}.ts`);
      if (i % 2 === 0) {
        appendFileSync(log, text); // a whole line
        continue;
      }
      const half = Math.floor(text.length / 2);
      appendFileSync(log, text.slice(0, half)); // one line written in two halves
      // Every 50 appends, let the watcher read the first half on its own before the rest arrives, then catch up.
      if (i % 50 === 49) expect(await caughtUp()).toBe(true);
      appendFileSync(log, text.slice(half));
      if (i % 50 === 49) expect(await caughtUp()).toBe(true);
    }
    expect(await caughtUp()).toBe(true);
    expect(summaries).toEqual(Array.from({ length: 1_000 }, (_, i) => `Editing f${i}.ts`)); // all, in write order
    expect(new Set(keys).size).toBe(1_000);
    expect(errors).toEqual([]);
    expect(places.at(-1)).toBe(statSync(log).size);
  });

  it("does not replay old, quiet logs as if they were happening now", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    mkdirSync(join(dir, "old-app"));
    const old = join(dir, "old-app", "s0.jsonl");
    writeFileSync(old, toolUse("old", "x.ts"));
    const tenMinutesAgo = new Date(Date.now() - 11 * 60_000);
    utimesSync(old, tenMinutesAgo, tenMinutesAgo);
    const events: NightEvent[] = [];
    stop = watchLogs({ root: dir, everyMs: 50, onEvent: (e) => events.push(e) });
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual([]);
    appendFileSync(old, toolUse("new", "y.ts"));
    expect(await until(() => events.some((e) => e.kind === "tool.use"))).toBe(true);
    expect(events.flatMap((e) => (e.kind === "tool.use" ? [e.summary] : []))).toEqual(["Editing y.ts"]);
  });

  it("reads a whole session that starts after Spyglass did, and a log that is replaced", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    const events: NightEvent[] = [];
    stop = watchLogs({ root: dir, everyMs: 50, onEvent: (e) => events.push(e) });
    await new Promise((r) => setTimeout(r, 150)); // the logs folder does not exist yet
    mkdirSync(join(dir, "demo-app"));
    const log = join(dir, "demo-app", "s1.jsonl");
    writeFileSync(log, toolUse("t1", "a.ts") + toolUse("t2", "b.ts"));
    const edits = () => events.flatMap((e) => (e.kind === "tool.use" ? [e.summary] : []));
    expect(await until(() => edits().length === 2)).toBe(true);
    const other = join(dir, "demo-app", "next.tmp");
    writeFileSync(other, toolUse("t3", "c.ts") + toolUse("t4", "d.ts")); // same size, a different file
    renameSync(other, log);
    expect(await until(() => edits().length === 4)).toBe(true);
    expect(edits()).toEqual(["Editing a.ts", "Editing b.ts", "Editing c.ts", "Editing d.ts"]);
  });

  it("reads only the recent end of a big log, without a broken first line", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    mkdirSync(join(dir, "demo-app"));
    const lines = Array.from({ length: 40 }, (_, i) => toolUse(`t${i}`, `f${i}.ts`));
    writeFileSync(join(dir, "demo-app", "s1.jsonl"), lines.join(""));
    const events: NightEvent[] = [];
    let skipped = 0;
    const tailBytes = (lines[0] ?? "").length * 3 + 10; // three whole lines and part of a fourth
    stop = watchLogs({
      root: dir,
      everyMs: 50,
      tailBytes,
      onEvent: (e) => events.push(e),
      onSkipped: (n) => (skipped += n),
    });
    expect(await until(() => events.filter((e) => e.kind === "tool.use").length === 3)).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(events.flatMap((e) => (e.kind === "tool.use" ? [e.summary] : []))).toEqual([
      "Editing f37.ts",
      "Editing f38.ts",
      "Editing f39.ts",
    ]);
    expect(skipped).toBe(0);
  });

  it("keeps watching when a listener throws", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    mkdirSync(join(dir, "demo-app"));
    writeFileSync(join(dir, "demo-app", "s1.jsonl"), toolUse("t1", "a.ts") + toolUse("t2", "b.ts"));
    const seen: string[] = [];
    const errors: unknown[] = [];
    stop = watchLogs({
      root: dir,
      everyMs: 50,
      onEvent: (e) => {
        if (e.kind !== "tool.use") return;
        seen.push(e.summary);
        if (seen.length === 1) throw new Error("listener broke");
      },
      onError: (e) => errors.push(e),
    });
    expect(await until(() => seen.length === 2)).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it("leaves a workflow run alone (Forge shows pipelines), and follows the background agent next to it", async () => {
    dir = mkdtempSync(join(tmpdir(), "spyglass-"));
    const subagents = join(dir, "demo-app", "s-demo-1", "subagents");
    const run = join(subagents, "workflows", "wf_demo");
    mkdirSync(run, { recursive: true });
    writeFileSync(join(dir, "demo-app", "s-demo-1.jsonl"), toolUse("t0", "main.ts"));
    writeFileSync(
      join(run, "journal.jsonl"),
      `${JSON.stringify({ type: "started", agentId: "agent-13", label: "#13 Dark mode toggle" })}\n`,
    );
    const agentStep = (agentId: string, file: string) =>
      line({
        type: "assistant",
        agentId,
        isSidechain: true,
        message: { content: [{ type: "tool_use", id: agentId, name: "Edit", input: { file_path: file } }] },
      });
    writeFileSync(join(run, "agent-agent-13.jsonl"), agentStep("agent-13", "/work/demo-app/header.tsx"));
    writeFileSync(join(subagents, "agent-bg1.jsonl"), agentStep("bg1", "/work/demo-app/guide.md"));
    expect(
      logFiles(dir)
        ?.map((f) => f.path.slice(dir.length))
        .sort(),
    ).toEqual(["/demo-app/s-demo-1.jsonl", "/demo-app/s-demo-1/subagents/agent-bg1.jsonl"]);
    const steps: NightEvent[] = [];
    stop = watchLogs({ root: dir, everyMs: 50, onEvent: (e) => steps.push(e) });
    expect(await until(() => steps.some((e) => e.kind === "tool.use" && e.agentId === "bg1"))).toBe(true);
    expect(steps.some((e) => e.agentId === "agent-13")).toBe(false);
  });
});
