# Spyglass (was Lens, before that Night Shift)

The name on screen, in the docs, the `spyglass` command and package, the `SPYGLASS_*` settings (old `NIGHTSHIFT_*` still read, with one warning each) and the service names is Spyglass; the data folder `~/.nightshift` moves next (decisions.md).

A live screen for Claude Code agents. Read `docs/SPEC.md` (what and why) and `docs/decisions.md` (the decision tree)
before changing anything; update both in the same commit when a choice changes.

## Layout (the layers only point one way: watcher -> parser -> store -> server -> web)

- `src/parser/`: a Claude Code log line -> a Lens event. Pure functions; no file system, no network.
- `src/watcher/`: follows the log folders and hands new lines to the parser. Read only. Polls once a second
  (`tail.ts` works in BYTES and decodes only whole lines, so a read that ends inside a character never corrupts it;
  `follow.ts` walks `<root>/<project>/*.jsonl` and starts over when a file is replaced (new inode) or shrinks).
  On start, files quiet for 10 minutes are followed from their end (old history is not "now"); recent ones are read
  (the last 256 KB of a big one); a file that appears later is read from its start. `files.ts` lists the logs and `follow.ts`
  reads them with sync calls, so a look always returns (opened `O_NONBLOCK`; a pipe or other non-file is reported
  once as "not a regular file" and skipped); at most 8 MB of one file per look; a file that fails is reported once.
  `backlog.ts` + `health.ts`: stale = a followed log has had bytes past
  the watcher's read place (`onPlace`) for 30 min at the same place (a touched log is not work); its `watchdog` makes
  the CLI write one line and SIGKILL itself on the first stale check (every minute; a plain `process.exit` is not trusted
  to end a stuck process), so the service starts a fresh Lens.
- `src/store/`: the board (state from events) and `history.ts`, the SQLite history (`node:sqlite`): every event under a
  key `<file>#<inode>.<epoch>@<line end>.<n>` (`INSERT OR IGNORE`, so a line read twice is stored once and not
  applied twice), plus each file's saved offset. The ONLY place that writes to disk. `src/engine.ts` wires it: prune (30 days,
  whole sessions, hourly), then replay the stored events into the `Board` (rows an older Lens stored from workflow runs
  are skipped, issue 28), then `watchLogs` with `resume`, `onRead` and `forgetAfterMs`. Memory is bounded by the same
  keep window: `Board.forget` runs hourly and the watcher forgets gone or quiet files (decisions.md).
  A file that was replaced (new inode) or cut short gets a new `epoch`, so its lines are new, not repeats.
- `src/server/`: `/events` (Server-Sent Events, one `event: <kind>` frame per event), `/health` (the engine's
  `health()`: `lastLineAt`, `lastChangeAt`, `unreadSince`, 503 when stale), later `/state`; binds
  127.0.0.1 only and answers only a `Host` of `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding), no CORS;
  a page that stops reading is dropped past 1 MB waiting. `res.write()` there is a network write, which the
  disk-write rule allows. The terminal view prints control characters from logs as `�` (no escape injection).
- `src/web/`: the page, sent as text by the server (`page.ts`, `style.ts`; one script = `client-start.ts` +
  `page-math.ts` (`PAGE_MATH`: pure arithmetic, tested, sent as its own source) + `client-end.ts`). The usage
  meter and the Sentinel link are Motherboard's (issue 27, decisions.md); the CLI re-pushes the open pages every 30 s
  so a quiet project's tile dims. Tabs: Board (NOW strip, background agents), Terminal,
  Timeline. It asks the server for nothing: `/events?project=<name>` pushes the whole board (`event: board`), `?project=`
  the project list. Every value from the logs is set with `textContent`. No web fonts or other outside loads. The CLI
  adds the repo name (`store/repo.ts`, from `.git/config`) and shows the home folder as `~`.
- Background agents (ticket 7): the watcher also follows `<session>/subagents/agent-*.jsonl` and reads each
  `agent-*.meta.json` (its description; `parseAgentMeta`). Workflow runs under `<session>/subagents/workflows/` are not
  followed: Forge runs and shows them (issue 28). The parser adds `paths` to `tool.use` (`parser/paths.ts`),
  `agent.task`, `agent.title` and `turn.end`. `store/workers.ts` keeps one worker per agent id (every agent step goes
  there) and files it by the repository most of its paths belong to (`store/root.ts`, worktree = its main repo); `Board`
  exposes `view().agents`, `projects()[].agents` and `agentLabel()` (the terminal's tag). See decisions.md.
- Projects everywhere (ticket 8): `store/places.ts` files each main-session step by the repositories its paths belong to
  (a session shows on every repo it works in); `store/pinned.ts` reads `~/.nightshift/projects.json` and builds the start
  page tiles (pinned always, recent repos under `~/Projects` added, idle dimmer). See decisions.md.
- Trouble (ticket 5): `parser/trouble.ts` turns Claude Code's `isApiErrorMessage` lines into `session.trouble` (reason,
  `resetsAt`, limit type); the board keeps it on the session until the next real step and lists it as `alerts` in the
  view; the page's NOW strip shows the newest one in amber. A background agent's own trouble stays on its desk until its
  next real step.
- Desks (issue 15): `GET /agents` returns every live agent (main sessions and background agents) as
  board-kit's `Agents` part, for Motherboard to pull (read only, same Host check, no CORS). `parser/usage.ts` reads
  `message.model` and `message.usage` into `turn.usage` (the store keeps the last line per `message.id`, so a message
  split over lines counts once); `store/desks.ts` (`DeskLog`, `desksOf`, the only file that knows board-kit's contract) adds
  tokens per agent, open `AskUserQuestion` calls and trouble. `Desk`/`DesksView` are board-kit's `Agent`/`Agents` at
  commit 0c60024 (copies in `test/fixtures/`), so only its keys go out: `costUsd` is always null, and tokens stay in the
  store (`Board.deskTokens`) until the contract has a field for them. See decisions.md.
  `store/desk-parts.ts` builds the Parts the `/agents` desks are made from.
- `src/cli.ts` wires them together (`src/terminal.ts` is the terminal view: one line per step, titles and pull
  requests printed once per session, local time); `test/` holds the scenario tests and `test/fixtures/` real-shaped sample logs.

## Rules (checked by `npm run ci`, which CI runs on every push)

- `scripts/check-rules.mjs`: no `@ts-ignore`, TODO needs a ticket (`TODO(#12)`), no personal paths, no `.only`, no
  eval, only `src/store/` writes to disk, files under 300 lines. Exempt a line with `rules-ok: <reason>`.
- `test/architecture.test.ts`: the layer rule above, and the parser never imports fs or the network.
- Biome (no `any`, no `!`, complexity 20, no unused code), strict TypeScript, coverage floor in `vitest.config.ts`
  (only ever raise it).
- Tests are scenarios (a developer does X, the screen shows Y), fed with real-shaped logs.
- A fresh reviewer reads each diff before it is committed. One ticket per evening, one visible win.
- Node 22 or newer. Commands: `npm run ci`, `npm run dev`, `npm test`.
