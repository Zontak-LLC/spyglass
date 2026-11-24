import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NPM = "package-ecosystem: npm";
const ACTIONS = "package-ecosystem: github-actions";

describe("Dependabot settings", () => {
  it("a maintainer opens the Dependabot settings; majors are ignored for npm only", () => {
    const text = readFileSync(".github/dependabot.yml", "utf8");

    expect(text.split("\n")[0]).toBe("version: 2");
    expect([...text.matchAll(/package-ecosystem:\s*(\S+)/g)].map((m) => m[1])).toEqual(["npm", "github-actions"]);
    expect(text).not.toMatch(/\t/);

    const npm = text.slice(text.indexOf(NPM), text.indexOf(ACTIONS));
    expect(npm).toContain('dev-tools: { patterns: ["*"] }');
    expect(npm).toMatch(/ignore:\s*\n\s*- dependency-name: "\*"/);
    expect(npm).toContain('update-types: ["version-update:semver-major"]');

    const actions = text.slice(text.indexOf(ACTIONS));
    expect(actions).not.toContain("ignore:");
  });
});
