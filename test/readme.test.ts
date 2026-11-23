import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OLD_NAMES } from "./old-names.js";

// Scenario: a stranger opens the public repo. scripts/check-rules.mjs does not scan README.md, so this guards it:
// the new name, no private projects or paths, no dead link to Sentinel's private repo, and a real-sized screenshot.
const ROOT = join(import.meta.dirname, "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const SHOT = join(ROOT, "docs", "screenshot.png");

describe("the README a stranger reads first", () => {
  it("is about Spyglass and shows the board", () => {
    expect(README.startsWith("# Spyglass\n")).toBe(true);
    expect(README).toContain("](docs/screenshot.png)");
  });

  it.each([
    "Ticket 3",
    "npx nightshift",
    "magsmith",
    "usehourly",
    "Loader",
    "UseHourly",
    "/Users/",
    "../nightwatch",
    "github.com/zontak-ai/nightwatch",
    "github.com/zontak-ai/nightshift",
    "/tmp/lens.log",
    "nohup",
  ])("does not say %s", (word) => {
    expect(README).not.toContain(word);
  });

  it("points strangers at the zontak-ai repo", () => {
    expect(README).toContain("https://github.com/zontak-ai/spyglass");
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.homepage).toBe("https://github.com/zontak-ai/spyglass#readme");
    expect(pkg.repository.url).toBe("git+https://github.com/zontak-ai/spyglass.git");
    expect(pkg.bugs.url).toBe("https://github.com/zontak-ai/spyglass/issues");
  });

  // A stale Spyglass kills itself, so the README's background setup must be a service that starts it again.
  it("runs Spyglass in the background as a service that restarts it", () => {
    expect(README).toContain("KeepAlive");
    expect(README).toContain("Restart=always");
  });

  // The two places an old name is meant: the note on what was renamed and the note on stopping a service set up
  // under an older name. Only these exact sentences are removed, so a second mention anywhere else still fails.
  const RENAME_NOTE =
    "Spyglass was called Lens, and before that Night Shift; old NIGHTSHIFT_* settings still work (with one warning each) and ~/.nightshift keeps its name for now.";
  const UPGRADE_NOTE =
    "Set it up under an older name? Stop that service first, so two do not fight over port 4400: `launchctl bootout gui/$(id -u)/dev.lens` on macOS, `systemctl --user disable --now lens` on Linux.";
  const README_WITHOUT_NOTES = README.replace(RENAME_NOTE, "").replace(UPGRADE_NOTE, "");
  const docs: [string, string][] = [
    ["README.md", README_WITHOUT_NOTES],
    ["SECURITY.md", readFileSync(join(ROOT, "SECURITY.md"), "utf8")],
    ["docs/SPEC.md", readFileSync(join(ROOT, "docs", "SPEC.md"), "utf8")],
  ];

  it.each([RENAME_NOTE, UPGRADE_NOTE])("keeps its one note: %s", (note) => {
    expect(README.split(note)).toHaveLength(2);
  });

  it.each([
    "NIGHTSHIFT_",
    "dev.lens",
    "lens.service",
    "lens.log",
    "Library/Logs/lens.log",
    "github.com/zontak-ai/lens",
    "zontak-ai/lens",
  ])("outside its notes, does not say %s", (old) => {
    expect(README_WITHOUT_NOTES).not.toContain(old);
  });

  it.each([
    "dev.spyglass",
    "spyglass.service",
    "Library/Logs/spyglass.log",
    "SPYGLASS_PORT",
    "systemctl --user enable --now spyglass",
  ])("sets Spyglass up under its own name: %s", (name) => {
    expect(README).toContain(name);
  });

  it.each(docs)("%s says none of the old names", (_file, text) => {
    for (const old of OLD_NAMES) expect(text).not.toContain(old);
  });

  it("has a screenshot under 500 KB, 1200 to 1600 px wide", () => {
    expect(existsSync(SHOT)).toBe(true);
    expect(statSync(SHOT).size).toBeLessThan(500 * 1024);
    const png = readFileSync(SHOT);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    const width = png.readUInt32BE(16); // the IHDR chunk: width, then height
    expect(width).toBeGreaterThanOrEqual(1200);
    expect(width).toBeLessThanOrEqual(1600);
  });
});
