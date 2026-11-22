import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, startBanner, usage } from "../src/usage.js";
import { freePort } from "./free-port.js";
import { OLD_NAMES } from "./old-names.js";

/** The first board (or project list, for "") the server pushes to a page. */
async function firstFrame(port: number, project: string): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/events?project=${encodeURIComponent(project)}`);
  const reader = res.body?.getReader();
  const decode = new TextDecoder();
  let text = "";
  while (!/\ndata: .*\n\n/.test(text)) {
    const { value, done } = (await reader?.read()) ?? { done: true };
    if (done) break;
    text += decode.decode(value);
  }
  await reader?.cancel();
  return JSON.parse(/\ndata: (.*)\n\n/.exec(text)?.[1] ?? "null");
}

// Runs the real command with the same Node that runs the tests (no npx, no network, works on Windows too).
const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" });

// Scenario: a developer who just installed Spyglass asks it what it is.
describe("a developer runs spyglass for the first time", () => {
  it("explains what it does, how to use it, and that nothing leaves the computer", () => {
    const { stdout, status } = run("--help");
    expect(status).toBe(0);
    expect(stdout).toMatch(/^Spyglass \d+\.\d+\.\d+/);
    expect(stdout).toContain("Claude Code agents");
    expect(stdout).toContain("spyglass -v, --version");
    expect(stdout.replaceAll("~/.nightshift", "")).not.toContain("nightshift");
    expect(stdout).toContain("Spyglass only reads Claude Code's log files. Nothing leaves your computer.");
    for (const old of OLD_NAMES) expect(stdout).not.toContain(old);
    // Only Spyglass's own settings, under their new names (no old prefix): the usage meter and the Sentinel link are
    // Motherboard's now.
    expect([...stdout.matchAll(/\b[A-Z]+_[A-Z_]+\b/g)].map((m) => m[0])).toEqual([
      "SPYGLASS_PORT",
      "SPYGLASS_LOGS",
      "SPYGLASS_DATA",
      "SPYGLASS_KEEP_DAYS",
    ]);
    expect(stdout).not.toMatch(/Sentinel|usage meter|usage file/i);
  });

  it("starts with no Sentinel and no usage file, and warns about neither", async () => {
    const home = mkdtempSync(join(tmpdir(), "lens-cli-"));
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts"], {
      env: {
        ...process.env,
        HOME: home,
        SPYGLASS_LOGS: join(home, "logs"),
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
      const end = Date.now() + 15_000;
      while (!stdout.includes("Desks:") && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
      expect(stdout).toContain(`Board: http://localhost:${port}/`);
      const page = await (await fetch(`http://127.0.0.1:${port}/demo-app`)).text();
      expect(page).toContain("<title>Spyglass</title>");
      // The board and the start page's tiles carry no meter and no Sentinel keys.
      const board = (await firstFrame(port, "demo-app")) as Record<string, unknown>;
      expect(board).toMatchObject({ project: "demo-app", name: "demo-app" });
      expect(board).not.toHaveProperty("meter");
      expect(board).not.toHaveProperty("watch");
      const tiles = (await firstFrame(port, "")) as Record<string, unknown>[];
      expect(Array.isArray(tiles)).toBe(true);
      for (const tile of tiles) expect(Object.keys(tile)).not.toContain("watch");
      await new Promise((r) => setTimeout(r, 300)); // time for a late warning to show
      expect(stderr).not.toContain("spyglass:");
      expect(`${stdout}${stderr}`).not.toMatch(/Sentinel|usage/i);
    } finally {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await exited;
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);

  it("says Spyglass, what it watches and where the board is when it starts", () => {
    const text = startBanner({
      version: "1.2.3",
      root: "~/.claude/projects",
      db: "~/.nightshift/nightshift.db",
      keepDays: 30,
      port: 4400,
    });
    expect(text.startsWith("Spyglass 1.2.3 · watching ~/.claude/projects\n")).toBe(true);
    expect(text).toContain("History: ~/.nightshift/nightshift.db (30 days)");
    expect(text).toContain("Board: http://localhost:4400/");
    expect(text).toContain("Desks: http://localhost:4400/agents");
  });

  it("prints just the version for --version", () => {
    expect(run("--version").stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("refuses an unknown option with exit code 2 and shows the help", () => {
    const { stderr, status } = run("--bogus");
    expect(status).toBe(2);
    expect(stderr).toContain("spyglass: unknown option --bogus");
    expect(stderr).toContain("Usage:");
  });

  it("works as the built, installed command too", () => {
    execFileSync("npm", ["run", "build", "--silent"], { encoding: "utf8", shell: process.platform === "win32" });
    const built = spawnSync(process.execPath, ["dist/cli.js", "--version"], { encoding: "utf8" });
    expect(built.status).toBe(0);
    expect(built.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  }, 60_000);
});

describe("reading the command line", () => {
  it.each([
    [[], "start"],
    [["-h"], "help"],
    [["--help"], "help"],
    [["-v"], "version"],
    [["--version"], "version"],
    [["--bogus"], "unknown"],
  ])("%j means %s", (args, kind) => {
    expect(parseArgs(args).kind).toBe(kind);
  });

  it("names the version in the help", () => {
    expect(usage("1.2.3").split("\n")[0]).toBe("Spyglass 1.2.3");
  });
});
