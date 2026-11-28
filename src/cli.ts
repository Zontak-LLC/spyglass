#!/usr/bin/env node
// Spyglass's `spyglass` command: wires the watcher to the server and the terminal. See CLAUDE.md for the layers.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { startEngine } from "./engine.js";
import type { NightEvent } from "./parser/index.js";
import { startServer } from "./server/index.js";
import { keepDaysOf, readSettings } from "./settings.js";
import { expand, loadPinned, projectTiles, repoOf } from "./store/index.js";
import { terminalPrinter } from "./terminal.js";
import { parseArgs, startBanner, usage } from "./usage.js";
import { STALE_MS, WATCHDOG_EVERY_MS, watchdog } from "./watcher/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const command = parseArgs(process.argv.slice(2));
const setting = readSettings(process.env, (message) => console.error(`spyglass: ${message}`));

/** A positive whole number of ms from a setting, or the default for anything else. */
function settingMs(text: string | undefined, fallback: number): number {
  const ms = Number(text);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : fallback;
}
/** A path with the home folder shown as `~`. */
function hideHome(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

async function start(): Promise<void> {
  const root = setting("LOGS") || join(homedir(), ".claude", "projects");
  const dataDir = setting("DATA") || join(homedir(), ".nightshift");
  const { days: keepDays, reason } = keepDaysOf(setting("KEEP_DAYS"));
  if (reason) console.error(`spyglass: ${reason}`);
  let publish: (event: NightEvent) => void = () => {};
  const print = terminalPrinter((id) => engine.board.agentLabel(id));
  const engine = startEngine({
    root,
    dbPath: join(dataDir, "nightshift.db"),
    keepDays,
    staleMs: settingMs(setting("STALE_MS"), STALE_MS),
    onNew: (event) => {
      publish(event);
      const line = print(event);
      if (line) console.info(line);
    },
    onError: (error) => console.error(`spyglass: ${error instanceof Error ? error.message : String(error)}`),
  });
  const { board } = engine;
  const pinnedFile = join(dataDir, "projects.json");
  let lastWarning = "";
  const warn = (message: string) => {
    if (message === lastWarning) return; // the list is read on every push; say a problem once
    lastWarning = message;
    console.error(`spyglass: ${message}`);
  };
  const tiles = () =>
    projectTiles(board.projects(), loadPinned(pinnedFile, warn), { home: homedir(), nowMs: Date.now() });
  const server = await startServer(Number(setting("PORT")) || 4400, {
    view: (project) => {
      const view = board.view(project);
      const home = homedir();
      const folder = view.folder ? hideHome(view.folder) : view.folder;
      const pinned = loadPinned(pinnedFile, warn);
      const name = pinned.find((p) => basename(expand(p.path, home)) === project)?.name ?? project;
      return { ...view, name, folder, repo: view.folder ? repoOf(view.folder) : null };
    },
    projects: tiles,
    agents: () => board.desks(Date.now()),
    health: () => engine.health(),
  });
  publish = server.publish;
  setInterval(server.refresh, 30_000).unref(); // a quiet project's tile goes idle (dims) without any event
  console.info(
    startBanner({ version: pkg.version, root, db: join(dataDir, "nightshift.db"), keepDays, port: server.port }),
  );
  const quit = async (code = 0) => {
    stopWatchdog();
    engine.stop();
    await Promise.race([server.close(), new Promise((r) => setTimeout(r, 5_000))]); // a stuck Lens must still exit
    process.exit(code);
  };
  // A Lens that stopped reading cannot heal itself, and process.exit() can hang behind stuck file threads (a Mac Lens
  // stayed alive 13 h in uv_thread_join). So: say so once, then SIGKILL itself; the service starts a fresh one.
  const killSelf = () => process.kill(process.pid, "SIGKILL");
  const stopWatchdog = watchdog(
    () => engine.health(),
    (health) => {
      stopWatchdog();
      try {
        engine.stop();
      } catch {
        // dying anyway: the history is committed per read, so at most the last read is read again
      }
      setTimeout(killSelf, 1_000); // not unref'd: the kill comes even when the write callback never does
      const unread = engine.unread();
      const file = unread ? hideHome(unread.path) : "a log";
      process.stderr.write(
        `spyglass: ${file} has unread bytes since ${health.unreadSince} (last line read ${health.lastLineAt ?? "the start"}); killing this Spyglass so the service starts a fresh one\n`,
        killSelf,
      );
    },
    settingMs(setting("WATCHDOG_MS"), WATCHDOG_EVERY_MS),
  );
  process.on("SIGINT", () => void quit());
  process.on("SIGTERM", () => void quit());
}

if (command.kind === "version") console.info(pkg.version);
else if (command.kind === "help") console.info(usage(pkg.version));
else if (command.kind === "start") await start();
else {
  console.error(`spyglass: unknown option ${command.arg}\n\n${usage(pkg.version)}`);
  process.exitCode = 2;
}
