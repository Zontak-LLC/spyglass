import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSettings } from "../src/settings.js";
import { freePort } from "./free-port.js";

/** A reader over `env` plus every warning it gave. */
function reader(env: NodeJS.ProcessEnv) {
  const warnings: string[] = [];
  return { setting: readSettings(env, (message) => warnings.push(message)), warnings };
}

// Scenario: a developer set Spyglass up before the rename, under NIGHTSHIFT_* settings, and upgrades.
describe("a developer upgrades with settings under the old NIGHTSHIFT_ names", () => {
  it("uses the SPYGLASS_ setting when both are set, and warns about nothing", () => {
    const { setting, warnings } = reader({ SPYGLASS_PORT: "5000", NIGHTSHIFT_PORT: "6000" });
    expect(setting("PORT")).toBe("5000");
    expect(warnings).toEqual([]);
  });

  it("falls back to the old name when the new one is empty, and says so once however often it is read", () => {
    const { setting, warnings } = reader({ SPYGLASS_PORT: "", NIGHTSHIFT_PORT: "6000" });
    expect([setting("PORT"), setting("PORT"), setting("PORT")]).toEqual(["6000", "6000", "6000"]);
    expect(warnings).toEqual(["NIGHTSHIFT_PORT is the old name; use SPYGLASS_PORT"]);
  });

  it("warns once for each old name it uses", () => {
    const { setting, warnings } = reader({ NIGHTSHIFT_LOGS: "/logs", NIGHTSHIFT_DATA: "/data" });
    expect([setting("LOGS"), setting("DATA"), setting("LOGS")]).toEqual(["/logs", "/data", "/logs"]);
    expect(warnings).toEqual([
      "NIGHTSHIFT_LOGS is the old name; use SPYGLASS_LOGS",
      "NIGHTSHIFT_DATA is the old name; use SPYGLASS_DATA",
    ]);
  });

  it.each([
    ["both empty", { SPYGLASS_PORT: "", NIGHTSHIFT_PORT: "" }],
    ["both unset", {}],
  ])("gives no value when %s, so the default is used", (_case, env: NodeJS.ProcessEnv) => {
    const { setting, warnings } = reader(env);
    expect(setting("PORT")).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("serves the board on the old NIGHTSHIFT_PORT and logs one warning line per old name", async () => {
    const home = mkdtempSync(join(tmpdir(), "spyglass-settings-"));
    const port = await freePort();
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
    for (const key of Object.keys(env)) if (/^(SPYGLASS|NIGHTSHIFT)_/.test(key)) delete env[key];
    Object.assign(env, {
      NIGHTSHIFT_LOGS: join(home, "logs"),
      NIGHTSHIFT_DATA: join(home, "data"),
      NIGHTSHIFT_PORT: String(port),
    });
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts"], { env });
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
      const page = await fetch(`http://127.0.0.1:${port}/demo-app`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<title>Spyglass</title>");
      // Every line but Node's own (the SQLite ExperimentalWarning) is one of the three warnings, each exactly once:
      // no line under the old prefix, and no warning repeated.
      const ours = stderr
        .split("\n")
        .filter((line) => line && !line.startsWith("(node:") && !line.startsWith("(Use `"));
      const expected = ["LOGS", "DATA", "PORT"].map(
        (name) => `spyglass: NIGHTSHIFT_${name} is the old name; use SPYGLASS_${name}`,
      );
      expect([...ours].sort()).toEqual([...expected].sort());
    } finally {
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await exited;
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
