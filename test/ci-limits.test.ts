import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = ".github/workflows";
const MAX_JOB_MINUTES = 15;

describe("CI time limits", () => {
  it("a maintainer adds a CI job; it must carry a time limit", () => {
    const files = readdirSync(WORKFLOWS_DIR)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();
    expect(files).toEqual(["ci.yml"]);

    const minutes: number[] = [];
    for (const file of files) {
      const text = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      const jobs = text.match(/^\s*runs-on:/gm) ?? [];
      const limits = [...text.matchAll(/^\s*timeout-minutes:\s*(\S+)\s*$/gm)].map((m) => m[1] ?? "");
      expect(limits.length).toBe(jobs.length);
      for (const value of limits) {
        expect(value).toMatch(/^\d+$/);
        minutes.push(Number(value));
      }
    }
    expect(minutes).toEqual([15]);
    for (const value of minutes) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(MAX_JOB_MINUTES);
    }
  });
});
