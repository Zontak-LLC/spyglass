import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { freePort } from "./free-port.js";

const MARKER = "PROMPT-MARKER-7f3";
const SESSION = "s-service-1";
const WAIT_MS = 15_000;

/** A real-shaped session log: the developer types a prompt, then Claude reads a file. */
function sessionLog(now: number): string {
  const base = {
    isSidechain: false,
    userType: "external",
    cwd: "/work/demo-app",
    sessionId: SESSION,
    version: "0.0.0-fixture",
    gitBranch: "main",
  };
  const prompt = {
    ...base,
    parentUuid: null,
    type: "user",
    message: { role: "user", content: `Ship the plan ${MARKER} tonight` },
    uuid: "e0000001-0000-4000-8000-000000000001",
    timestamp: new Date(now - 2_000).toISOString(),
  };
  const read = {
    ...base,
    parentUuid: prompt.uuid,
    type: "assistant",
    message: {
      id: "msg_s1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "tool_use", id: "tu_s1", name: "Read", input: { file_path: "/work/demo-app/src/cart.ts" } }],
      stop_reason: "tool_use",
    },
    uuid: "e0000001-0000-4000-8000-000000000002",
    timestamp: new Date(now - 1_000).toISOString(),
  };
  return `${JSON.stringify(prompt)}\n${JSON.stringify(read)}\n`;
}

// Scenario: a developer runs Lens as a service, whose output is its log file, and types a prompt to Claude.
describe("a developer runs Lens as a service", () => {
  it("logs the steps but never what the developer typed", async () => {
    const home = mkdtempSync(join(tmpdir(), "lens-service-"));
    const logs = join(home, "logs");
    mkdirSync(join(logs, "demo-app"), { recursive: true });
    writeFileSync(join(logs, "demo-app", `${SESSION}.jsonl`), sessionLog(Date.now()));
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts"], {
      env: {
        ...process.env,
        HOME: home,
        SPYGLASS_LOGS: logs,
        SPYGLASS_DATA: join(home, "data"),
        SPYGLASS_PORT: String(port),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    try {
      const end = Date.now() + WAIT_MS;
      while (!stdout.includes("Reading") && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
      expect(stdout).toMatch(/demo-app\s+Reading .*cart\.ts/);
      for (const output of [stdout, stderr]) {
        expect(output).not.toContain(MARKER);
        expect(output).not.toContain("asked:");
      }
    } finally {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await exited;
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
