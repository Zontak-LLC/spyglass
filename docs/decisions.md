# Spyglass: the decision tree

Every choice that shapes the project, as a tree: a question, the branch taken, why, and what it ruled out. A branch
marked **OPEN** waits for an answer; answering it can change the branches under it. Claude adds a node whenever a choice
is made, in the same commit as the change. Rule 1 applies to every node: the right fit for the job, not habit.

## Spyglass: the public name (2026-11-21)

- **The owner's pick (2026-11-21):** the public name is Spyglass. Theia was the first idea, but Eclipse Theia already
  uses it for an open-source AI IDE, so Lens becomes Spyglass instead.
- **Mapping:** Lens -> Spyglass.
- **Words only.** Every word a person reads changes: the start page, a board's title, header and banner, the loading
  text, the terminal's help and start line, the 403 text, the service log's stale line, README.md, SECURITY.md and
  docs/SPEC.md. Identifiers, file and folder names, ports and `~/.nightshift` keep theirs, so no install breaks. The
  command, npm package, settings, log prefix and service names followed in the next step (below).
- **Kept off the screens:** `test/old-names.ts` now lists the old name too; the page, command and docs tests fail on
  it. The README's rename note is the only place a reader still meets it.

## Settings, command, package and service: spyglass (2026-11-22)

- **Branch taken:** the command and npm package are `spyglass` (bin `spyglass`, repo URLs github.com/zontak-ai/spyglass),
  the settings are `SPYGLASS_*` (PORT, LOGS, DATA, KEEP_DAYS, STALE_MS, WATCHDOG_MS), every log and error line starts
  with `spyglass: `, and the README's service steps use `dev.spyglass` (launchd), `spyglass.service` (systemd) and
  `~/Library/Logs/spyglass.log`.
- **Old settings keep working:** `src/settings.ts` reads `SPYGLASS_<name>`, falls back to `NIGHTSHIFT_<name>`, and an
  empty value counts as unset. Using an old name writes one `spyglass: NIGHTSHIFT_<name> is the old name; use
  SPYGLASS_<name>` line per name per start (one line, not one per read: E1, no noise in the service log).
- **Old services:** a service set up from an older README (`lens` / `dev.lens`) is the user's own file and keeps running;
  the code does not touch it. The README tells them to stop it first, so two do not fight over port 4400.
- **Not yet:** the data folder stays `~/.nightshift` with `nightshift.db`; moving it to `~/.spyglass` is the next step,
  with the start page text that names `projects.json`. The `nightshift:tab` key in the browser stays.
- **Ruled out:** dropping `NIGHTSHIFT_*` at once (it would break every install silently).

## Who is it for?

- **Any developer who runs Claude Code** (2026-10-23, the owner). Each runs it on their own computer.
  - → No accounts, no server, nothing leaves the computer.
  - → Install is one command: `npx nightshift` (the npm name is free, checked 2026-10-23).
  - → No personal paths or settings in the code (a rules check enforces it).
  - **OPEN: a shared team board?** Yes would need a server and accounts; no keeps it local forever.

## How are several projects shown?

- **A board per project, at its own address; open several at once** (2026-10-23, the owner). One service serves them
  all; a start page lists the projects active in the last 10 minutes. Ruled out: one combined board (crowded with many
  projects).

## Where does it run?

- **On the developer's own computer** (2026-10-23).
  - **OPEN: check from a phone, away from the desk?** Yes adds a phone view and a way to reach the service from outside
    the house (changes how the server listens). No keeps localhost only.

## What does it watch?

- **Version 1: Claude Code logs only, read only** (2026-10-23).
  - Later: GitHub pull requests and CI runs (version 2).
- **Version 2: Night run**, Lens starts the work itself (2026-10-23, the owner). **Default: all night until the
  queue is done.** Optional `ticketLimit` (5, 10, ...) for accounts with usage limits, then "Start next batch". Reaching a
  usage limit pauses, never fails, and resumes without redoing finished tickets.
  - **OPEN: in version 1 instead?** Recommended no: watching must be reliable before Lens starts anything.

## Language and tools (Rule 1)

- **Node.js + TypeScript** (the owner prefers Node for own projects; it fits file watching and streaming). Runner-up: Go.
- **Server-Sent Events** for live updates (one-way is all that is needed). Runner-up: WebSockets.
- **SQLite** for history (one file, searchable). Runner-up: JSON files.
  - **History = the event log (ticket 6, 2026-10-24).** The board is built from events alone, so the file stores the events
    (idempotent by file + inode + epoch + line end) and each file's offset; sessions, background agents, steps and
    tickets are rebuilt by replay, not kept in tables of their own that could drift from the events. Retention removes
    whole sessions quiet for 30 days (`NIGHTSHIFT_KEEP_DAYS`). If the file cannot be opened, Lens runs without
    history and says so.
  - **Memory is bounded by the same keep window (issue 45, 2026-11-22).** At start-up the prune runs before the replay,
    so a month-old session is never loaded; every hour `Board.forget` drops sessions, agents and desk marks (with their
    places and token maps) quiet past `keepDays`, the watcher forgets files gone from the folder or unchanged that long
    (a forgotten log that grows again is read from its last 256 KB), and the path cache in `store/root.ts` keeps at
    most 5,000 entries. No new setting; the board's 6 h window for what is shown is unchanged.
  - **The history is private (2026-11-21).** It holds prompts, file paths and tool steps from every session, and
    another account on the computer must not read them. So each open (not only the first) sets the folder to 0700 and
    `nightshift.db` and its `-wal`/`-shm` files to 0600: `mkdir`'s mode applies only to a new folder and the umask can
    loosen it, so an older install is fixed on its next start. A chmod that fails is not skipped: opening the history
    throws an error naming the path and the mode, and the log shows it (Lens then runs without history, as above).
    Ruled out: setting the modes on first creation only (a loose install stays loose).
- **A local web page**, plain TypeScript and CSS, no framework for v1. Runner-up: a menu-bar app (later stretch).

## Where does the code live?

- **GitHub, open source (MIT), CI on every change** (2026-10-23, the owner).
  - **zontak-ai/nightshift**, public (2026-10-23, the owner): next to UseHourly and Club ADHD, same CI and Dependabot habits.
  - **CI: GitHub Actions only, no CircleCI** (2026-10-23): nothing to deploy (it runs on each developer's computer), no
    secrets, free for public repos. npm publishing later from GitHub Actions with trusted publishing (no stored token).

## How does the board look? (2026-10-24, the owner, after trying several)

- **Readable for hours:** a dark grey-blue page (`#16181d`), never pure black; soft off-white text (`#d4d7dd`, about 12:1),
  never pure white; a quieter grey for secondary text; thin quiet lines. Colour only with a meaning: blue = live,
  green = done, amber = needs attention. Sans for titles, monospace only for machine output.
  - Ruled out: phosphor green on black (tiring after a while), lavender on charcoal with gaps between boxes (busy),
    glow and scan lines (decoration).
- **Layout: the first design, in this palette (2026-10-24, the owner: "less boring", "looks more unique"):** a header
  of totals, a NOW strip, and tabs for Board (the assembly line with a belt under each station), Terminal and Timeline.
  It replaced the CICS / Norton Commander layout (framed areas with titles in the frame, a message line); its Key=Action
  line stayed. The first design's eight status colours were cut to four, each with one meaning. **Replaced in part
  2026-11-17** ("Pipelines removed"): no totals, no assembly line, no Key=Action line; the header keeps the meters.
- **The arithmetic is shared, not copied:** durations, the agent counts, the timeline's hour rows and the meters live in
  `src/web/page-math.ts` (was `shift.ts`, with the ticket totals until 2026-11-17), are tested there, and are sent to the page as their own source text (`Function.prototype.toString`),
  so the browser runs the tested code. `tsx` (`npm run dev`) wraps named arrows in `__name(...)`; a one-line no-op
  stand-in sent before them makes that harmless.
- **Fonts on the computer only:** the page loads nothing from the internet (no web fonts), so nothing leaves it.
- **The page asks for nothing:** the server pushes each open board its whole state over the stream (at most every 300 ms),
  so a reconnecting page is at once up to date, and the web layer never calls `fetch`.

## How do we know work has stopped? (ticket 5, 2026-10-24)

- **From Claude Code's own error lines**, read in the user's real logs: an assistant line with `isApiErrorMessage: true`
  and a structured `error` field. `rate_limit` (HTTP 429) = the usage limit, with `quotaLimits.resetsAt` (Unix seconds)
  and `rateLimitType` (for example `five_hour`); `server_error` = a lost connection or the computer slept;
  `authentication_failed` = the login expired. The sentence ("You've hit your session limit · resets 8:40pm") is only
  shown, never parsed. Ruled out: guessing from silence alone (a quiet ticket still shows "Quiet since" after 30 min).
- **A pause lasts until the next real step** of that session or agent, so the board clears by itself when work resumes.

## How do we keep it clean? (guardrails)

- Strict TypeScript, Biome, a rules script (no ts-ignore, TODO needs a ticket, no personal paths, only `src/store/`
  writes to disk, files under 300 lines), an architecture test (layers point one way), scenario tests, one
  `npm run ci`, a fresh reviewer before each commit. (2026-10-23)

## How are background agents shown? (ticket 7, 2026-10-24)

- **Each background agent is a "worker", linked to its parent session** (2026-10-24, the owner found that the board
  showed only the main session). Its log is `<session>/subagents/agent-<id>.jsonl`; the small `agent-<id>.meta.json`
  beside it holds the description it was started with, which is its name. With no description the name is the first
  line of its task prompt. Pipeline agents (a workflow's tickets) kept their own path through the run; every other agent
  id is a worker. **Replaced 2026-11-17** ("Pipelines removed"): workflow agents are not read, every agent id is a worker.
- **Its project comes from where it works, not where it started.** A subagent's lines carry the parent's `cwd`, so that
  says nothing. Instead the parser lists the paths each tool call touches (`parser/paths.ts`: file tools' paths, a
  command's `cd` targets, `git -C` folders, any absolute or `~/` path in the command). The store maps each to its git
  repository (`store/root.ts`: walk up to the folder with `.git`) and the worker's project is the repository with the
  most calls (a tie goes to the first seen). A path under `.claude/worktrees/<x>` or a `.git` file pointing at
  `<main>/.git/worktrees/<x>` counts as the main repository, marked "(worktree)". With no votes it falls back to the
  parent session's folder.
  - **Limits (said plainly):** a command that never names a folder (`npm test` after an earlier `cd` in another
    call) gives no vote; read-only looks at a path outside any repo (`/tmp`, `~/.claude`) give none; the home folder
    never counts as a repo, so a dotfiles repository cannot take over; the project name is the folder name, so two
    repositories with the same folder name share a board; a short agent that only searches the web stays under its
    parent. The project can change while the agent works, as the votes change.
- **Working or finished:** an agent is "working" until its turn ends with an answer (`stop_reason: end_turn`) or it has
  been quiet for 10 minutes. Agents quiet for 6 hours leave the board. Old agent files quiet at start are not read, so
  history is not shown as live.

- **Usage meter in the header (2026-10-24, the owner).** Read from `~/.claude/usage-now.json`, polled every 30 s, shown as
  two 10-segment bars; amber from 75% and red from 90% (the owner's warning line); grey "stale" after 15 minutes;
  hidden without the file. The page works out staleness with its own clock, so a file that stops updating turns grey
  without any new push. **Replaced 2026-11-17: Motherboard owns this** ("Sentinel link and usage meter move to
  Motherboard").

## Projects everywhere (ticket 8, 2026-10-24)

- **The owner's problem:** "add the Loader project here too". All Loader work (folder `magsmith`) happened in sessions
  started in another folder, and the board filed a session only under the folder it started in, so Loader never showed.
- **Main-session steps are attributed per step, with the rule of ticket 7.** Each tool call is filed by the repositories
  its paths belong to (`parser/paths.ts`, `store/root.ts`; a worktree counts as its main repository). A call with no
  path stays with the session's own folder; a call that touches two repositories counts in both. A session therefore
  shows on the board of every repository it worked in, with only the steps that worked there (`store/places.ts`), and
  its own project still lists it. Same limits as ticket 7: `npm test` after an earlier `cd` names no folder, so it
  stays at home. **Pipelines (workflow runs) stay with the project the session started in**: their tickets are not
  split (a run is one unit). **Replaced 2026-11-17** ("Pipelines removed").
- **A fixed project list on the start page** (`store/pinned.ts`). `~/.nightshift/projects.json` is a list of
  `{ path, name }`; it is created with four defaults when missing (Loader = `~/Projects/magsmith`, UseHourly,
  Sentinel, Lens). Pinned projects show even when idle (dimmer, after the busy ones, kept in file order). Other
  git repositories directly under `~/Projects` with Claude activity in the last 30 days are added by themselves, and
  any other project that is busy right now stays visible. To remove an auto-added repo, add
  `{ "path": "~/Projects/x", "hide": true }` to the file (the file is never rewritten after it exists).
  The display name is for people (tile and board title); the board address keeps the folder name (`/magsmith`).
  Each tile shows the last active time (from the history), agents and tickets working, and the open tickets of the
  newest pipeline run. "Busy" = a working ticket or agent, or a step in the last 10 minutes. **Replaced 2026-11-17**
  ("Pipelines removed"): a tile counts working agents only, and "busy" = a working agent or a recent step.
- **A damaged file never stops Lens:** invalid JSON, not a list, or a line without a `path` means the defaults
  are used and one line is printed in the log (`projects.json is not usable ... using the defaults`). The file is read
  again on every push, so an edit shows without a restart. Ruled out: a settings screen (SPEC section 3.7).
- **Limits (said plainly):** a project is its folder name, so two repositories with the same folder name share one board
  and one tile (as for agents). A session that started in a worktree or a subfolder belongs to its main repository.
  A usage-limit pause shows on every repository the session touched.

- **The link to Sentinel** (`src/watch/`). Lens is the workshop, Sentinel the guard; they meet at the
  release: Sentinel finds a problem, an issue is opened, Lens's agents fix it, the release goes out, Sentinel
  watches again. Lens only READS: `startWatchClient` follows Sentinel's `GET /events` (the `state`
  event) with `fetch`, backs off 1 s doubling to 30 s, drops old news when the stream drops, and shows "Sentinel: not
  running". The address (`NIGHTSHIFT_NIGHTWATCH_URL`, default `http://localhost:4500`) must be this computer; anything
  else is ignored with one warning. `watch/model.ts` reads the state defensively (a field of the wrong type is left out,
  nothing throws), because Sentinel is another project whose shapes may change.
  - **Site to project:** `watchSite` on a line of `projects.json` (`""` = none); default `magsmith` = `loader`,
    `usehourly` = `usehourly`. A site Sentinel does not list shows a plain note.
  - **Light** = the worst tile level of the site (problem = red, warn = amber, ok = green); tiles that are idle (not
    connected yet) do not count against it. **Release** = the Deploys tile (its figure, age and reason).
  - **Incidents as tickets** are a lane under the line, not a sixth station, because they have no ticket number and do
    not move left to right. Open ones (any severity, colour by severity) and the five newest resolved ones. The advice is
    the fix Sentinel proposes, else the first triage step. "Healed by" needs a fix attempt with the verdict "healed".
  - Ruled out: buttons that act on Sentinel (resolve, retriage, open an issue). Those stay in Sentinel.
  - **Replaced 2026-11-17: Motherboard owns this** ("Sentinel link and usage meter move to Motherboard").

## Motherboard's Desks (issue 15, 2026-10-29)

- **Pull, not push.** Motherboard reads `GET /agents`; Lens never sends anything anywhere. It is the same
  pattern as the rest of the server (127.0.0.1 only, the Host check against DNS rebinding) and needs no address,
  token or retry logic on our side. A stream (SSE) can come later if a pull every few seconds is not enough.
- **No CORS on purpose.** The payload lists what every agent is doing. Without CORS headers no page on another origin
  can read it, so Motherboard's server side must do the pull. That is intended.
- **Tokens only, no dollars** (the owner, 2026-10-29). The owner is on a flat plan, so per-token prices would mislead,
  and a price table needs upkeep. The store adds up tokens per agent (total, input, output, cache read, cache write)
  and the contract's `costUsd` is always null, never 0. Tokens come from `message.usage` of assistant lines
  (`turn.usage`); Claude Code repeats one message's usage on each of its lines, so the store keeps the last line per
  `message.id` (a map per agent, not just the last id: a log read again from the top has new history keys, so
  `INSERT OR IGNORE` cannot stop it). History stored before this change has no `turn.usage`: its tokens are unknown.
- **Follow-up for board-kit: a token field.** The contract (commit 0c60024) has no field for tokens, so `GET /agents`
  does not send them yet and the desks show no token count. The totals wait in `Board.deskTokens`; when `Agent` gets a
  field, add it to `Desk` and `deskOf`. Not squeezed into `model` or `steps`: those keep their own meaning.
- **One file knows the contract** (`store/desks.ts`, matched to board-kit commit 0c60024), so a change in board-kit's
  `Agents` is one place to follow. Only the contract's keys go out; the copies in `test/fixtures/` (`board-kit-contract.txt`,
  `board-kit-view-agents.txt`, the typed `board-kit-agents.ts`) are what the tests hold the payload against. Mapping:
  `title` is the ticket's, session's or agent's title, `ticket` a pipeline's `#7`, `role` the words main session /
  background agent / pipeline agent, `minutes` the run time in whole minutes, `idleMinutes` set when idle. Left out:
  `action` (read only, no buttons), `stage` and `finishedAt` (the spec asks for neither), and `done`, because a
  finished agent shows as idle, as the spec says, so DONE TODAY stays empty for now. **Replaced in part 2026-11-17**
  ("Pipelines removed"): no pipeline desks, so `ticket` is never sent.
- **Why it waits goes in `steps`.** `state: "waits"` says that it waits; the contract has no reason field, so a stopped
  agent's newest step is the board's word plus the reset time (`usage_limit, resets <time>`). A question needs none:
  its newest step is already `AskUserQuestion`.
- **The Agents tab is checked by hand after merge** (the owner, 2026-10-31). Not done yet: board-kit is not a package
  here and `view-agents.ts` needs its `agents.ts` and `view-html.ts`, which were neither copied nor read, so nothing so
  far shows the payload draws as desks. After merge, point Motherboard at `/agents` and confirm once that the desks
  show with `costUsd: null` and no `stage`, and that a `waits` desk draws as waiting. Then write the result here.
- **What counts as live.** As on the board: active, or seen in the last 6 hours and idle. Waiting for the owner (trouble,
  or an `AskUserQuestion` with no answer yet) sorts first. At most 50 desks. A pipeline desk uses its own agent's newest
  line, never the run's (another ticket's steps must not keep a stalled agent active), the repository of its own `cwd`
  when its session's log was not read (a worktree shows as its repo, through the cached `rootOf`). Pipeline and
  background desks take on their session's trouble only while their work is in progress: a finished one stays idle.
  A background desk's title is the agent's description or its id, never its
  task: the task is the start of its prompt, and prompts stay off this endpoint. `project` is the folder's name. Steps
  can hold a path (a Bash command's program word, a raw search pattern), so the home folder shows as `~` in steps and
  titles as the desk is built. The CLI sends `board.desks()` as it is, with no extra fields.
- **A pipeline's helpers get desks too.** An agent whose journal label has no ticket number (e.g. "rank open tickets")
  is in `run.helpers`, not on a ticket, and is never a background agent. It is a pipeline desk with its label as title
  and no `ticket`; its steps and times come from its own lines (`DeskLog`), because the board keeps only its latest step.
  **Replaced 2026-11-17** ("Pipelines removed"), as are the pipeline-desk rules above.

## Forge's Agents tile (issue 14, 2026-11-13)

Forge was Day Shift; the identifiers (`store/day-shift.ts`, `DayShiftAgents`) and the copied issue keep the old name.
- **A second route, not a second shape on `/agents`.** Forge defined its own contract (`role`, `worksOn`,
  `startedAt`, `limitMinutes`; copied to `test/fixtures/day-shift-agents-contract.txt`), which differs from board-kit's
  `Agents`. So `GET /api/agents` serves it and `/agents` stays exactly as it was. `store/day-shift.ts` is the only file
  that knows Forge's contract; both routes are built from the same desks (`seatedOf` in `store/desks.ts`, the Parts
  from `store/desk-parts.ts`), so there is one liveness rule.
- **Running = `working` or `waits`.** Idle desks (quiet for 10 minutes, or finished) drop off, and are dropped before
  the cut to 20, from the full uncut list (not `/agents`' 50), so they never push a running one out. Order is the
  desks' order: waiting first, then working, then newest.
- **Stuck limit** (decided by the owner, 2026-11-13): `limitMinutes` is 30 for pipeline agents, because long checks
  like `npm run ci` are normal; null for main sessions and background agents, so Forge's 15 minutes apply. A
  constant, not a setting. **Replaced 2026-11-17** ("Pipelines removed"): `limitMinutes` is always null.
- **A working desk goes idle after 10 quiet minutes and leaves the list,** so Forge's time-based "stuck" only shows
  for waiting agents. That is today's liveness rule, kept as it is.
- **What goes out.** Only the four keys. `startedAt` is the agent's own newest line (when it last showed progress).
  `worksOn` is built from the desk's repo, ticket and title (the home folder already shown as `~`): single spaces, cut
  to 200 characters last, `agent` if empty. Titles, never prompts or a background agent's task. Forge redacts too,
  but a secret typed into a session title would still go out.
- **Replaced 2026-11-21** ("GET /api/agents removed").

## Pipelines removed (issue 28, 2026-11-17)

- **Pipelines removed: Forge runs and shows them now; Lens no longer reads workflow journals, and replay skips old
  pipeline rows (issue 28).** The owner confirmed Forge took over the pipeline view, so no screen is lost.
  - **What went:** `parser/journal.ts` and its events, the watcher's `subagents/workflows/` folder (its journals AND
    its agents' logs, so a workflow agent never shows as a nameless background agent), the stations floor, its belt,
    the ticket cards and dialog, the header's ticket stats (Done, Merged, Skipped, Avg, Est. finish, On shift), the
    arrow keys, `BoardView.run`, `ProjectRow.running` / `open`, pipeline desks on `/agents` and `/api/agents`, and
    the 30-minute limit (`limitMinutes` is always null now). `web/shift.ts` became `web/page-math.ts` (`PAGE_MATH`).
  - **What stayed:** main sessions, background agents, trouble (the NOW strip), Terminal, Timeline (background agents
    only), the usage meter and Sentinel. `GET /agents` and `GET /api/agents` give the same answer for main sessions
    and background agents as before; `test/agents-snapshot.test.ts` holds a snapshot taken on the code before the
    removal (`test/fixtures/agents-snapshot.json`, never regenerated).
  - **Old history rows:** no migration and no delete. `History.replay` first collects the agent ids of every stored
    `agent.started` row (helpers too), then skips every `run.launched`, `run.queue`, `agent.started` and
    `agent.result` row and every step of those agents, so an old pipeline agent can never come back as a ghost
    background agent. The 30-day prune removes the rows. Accepted: if an `agent.started` row is pruned before some of
    that agent's steps, those steps show as an old idle background agent until they are pruned too.
  - **Mockup:** `docs/board-design/board-without-pipeline.html`.
  - Replaces the pipeline parts of: the board layout (2026-10-24), background agents (ticket 7), projects everywhere
    (ticket 8), Motherboard's Desks (issue 15) and Forge's Agents tile (issue 14, including its 30-minute limit).

## Sentinel link and usage meter move to Motherboard (2026-11-17, Fable deep review, issue 27)

- **Why.** Motherboard now shows the usage meter and Sentinel's sites, so Lens showing them too was a second copy to
  keep alive. Lens gets smaller and does one job: what the Claude Code agents are doing.
- **What went:** `src/watch/` (the client that followed Sentinel's `/events`), `src/meter.ts` (the reader of
  `~/.claude/usage-now.json`), `web/client-watch.ts`, `web/watch-view.ts`, `meterView` in `web/page-math.ts`, the
  header's 5 h / Week meter, the `→ Sentinel` link, the Live site strip, the From Sentinel lane, the tiles' site light,
  the `nightwatch-url` meta tag, the `NIGHTSHIFT_USAGE` and `NIGHTSHIFT_NIGHTWATCH_URL` settings, the board payload's
  `meter` and `watch` keys and the tiles' `watchSite` and `watch` keys, and `scripts/fill-watch-sites.mjs`.
- **What stayed:** trouble alerts. A usage-limit pause still shows "Paused: usage limit" in amber on the NOW strip;
  only the usage-file meter went. The CLI still re-pushes the open pages every 30 s, because a quiet project's tile
  must dim without any new event.
- **Old project lists:** a `projects.json` line that still has `watchSite` loads with no warning; the key is ignored.
  The owner's file is not rewritten.
- **`GET /agents` and `GET /api/agents` are unchanged.** `test/agents-unchanged.test.ts` compares both answers with
  golden files captured on the code before the removal (`test/fixtures/agents-route-snapshot.json`,
  `test/fixtures/api-agents-snapshot.json`; `test/fixtures/agents-snapshot.json` is the older board snapshot of issue
  28, so the new one has its own name).
- **Mockup:** `docs/board-design/no-sentinel-no-meter.html`.
- Replaces: "Usage meter in the header" (2026-10-24) and "The link to Sentinel" (under Projects everywhere).

## GET /api/agents removed (issue 37, 2026-11-21)

- **Why.** Forge and board-kit no longer read `GET /api/agents` (Flow checked Forge's src and scripts and board-kit's
  src, 2026-11-20). A second contract that nobody reads is still one to keep working, so it goes.
- **What went:** the `/api/agents` route (it now answers 404 "Not found", like any other unknown path),
  `store/day-shift.ts` (Forge's shape and its cut to 20 running agents), `Board.running` and the server source's
  `running`, `test/day-shift-agents.test.ts` and its three fixtures (`test/fixtures/day-shift-agents.ts`,
  `day-shift-agents-contract.txt`, `api-agents-snapshot.json`). `seatedOf` in `store/desks.ts` is no longer exported:
  only `desksOf` reads it.
- **What stayed:** `GET /agents` for Motherboard, byte for byte, guarded by `test/agents-unchanged.test.ts` (its golden
  file `test/fixtures/agents-route-snapshot.json`). `test/fixtures/agents-snapshot.json` is kept whole; its `running`
  key is no longer read. `test/desks-many.test.ts` keeps the 50-desk cut and the busy-first order under test.

## Prompts stay out of the service log (2026-11-20)

- **Why.** The command's output is the service log: whatever the terminal view prints ends up in a file. It printed
  every prompt ("▸ asked: …"), so a log kept what a person typed to Claude, and the README sent that log to a file in
  `/tmp`, which other people on the computer can read.
- **What changed.** `src/terminal.ts` no longer prints prompts. The README runs Lens as a real service that starts it
  again (the watchdog needs that): a macOS LaunchAgent (`KeepAlive`, log in `~/Library/Logs/lens.log`, mode 600) or
  a systemd user unit (`Restart=always`, log in the user's own journal). `test/service-log.test.ts` runs the real
  command on a log with a prompt and checks the prompt never reaches its output.
- **What is kept.** Titles, steps, failed steps, trouble lines, pull requests and file names still print. The page's
  Terminal and Board tabs still show prompts: they are served on 127.0.0.1 to this computer only, not written to a log.
- **Trade.** Someone running Lens by hand no longer sees prompts in the terminal; the page shows them.

## Logs are read with sync calls (2026-11-18)

- **Why.** The Mac's error log had 843 "no answer after 120 s" lines while the libuv workers sat idle: a read's
  wake-up was lost, not a thread held. Passing a stuck file over never helped, because the next reads waited the same
  way. The listing (`watcher/files.ts`) was already sync and never got stuck.
- **Choice.** `watcher/follow.ts` opens, fstats and reads each log with sync calls (`openSync` with
  `O_RDONLY | O_NONBLOCK`, `fstatSync`, `readSync`), in one helper, `readRange`, used by the log reader and the agent
  description reader. A path that is not a regular file (a pipe, a device) is reported once ("not a regular file")
  and skipped; `O_NONBLOCK` keeps the open of a pipe with no writer from freezing Lens. A log read that fails is
  reported once and keeps its place; an agent description that fails for other reasons (gone, not readable yet) is
  retried quietly on the next look, as before. The 2-minute timeout and the passing-over of a stuck read are gone.
- **Trade.** One look blocks the event loop while it reads: at most one `chunkBytes` (8 MB) local read per file, so
  milliseconds; the first look after a long sleep can make `/health` and the pages answer a little later. A log on a
  network or FUSE folder could still block a sync read; the watchdog (SIGKILL, entry below) stays the last resort.
- **Not chosen.** A bigger `UV_THREADPOOL_SIZE` (the same jam, later) or a timeout race (it passes a read over but
  never frees it).

## Stale = unread bytes; the watchdog kills itself (2026-11-17)

- **Why.** Two bugs from the deep review. (1) False restarts: stale was "no line read for 30 minutes while a log's
  mtime changed", and Claude Code touches idle logs about hourly, so Lens restarted itself for nothing 39 times a
  week on tao and 103 times on the Mac. (2) A restart that did not happen: on the Mac a stale Lens called
  `process.exit()`, which waited in `uv_thread_join` on the stuck file threads; the process stayed alive 13 h with its
  port closed, so launchd never started a new one.
- **Stale = bytes nobody read.** The watcher reports each log's read place (`onPlace`: bytes read, a half-written
  last line included, also after a failed read). `watcher/backlog.ts` stats the placed logs (sync) on each health
  check: a log is unread when its size is past its read place. It keeps since when per log, reset when the place
  moves (catching up a backlog is not stale) and cleared when all is read; a gone log is dropped. Stale = the oldest
  unread log has waited more than 30 minutes. `/health` adds `unreadSince`; `lastLineAt` and `lastChangeAt` stay for
  monitors but decide nothing.
- **The watchdog kills itself.** On the first stale check the CLI stops the watchdog and the engine (in a try),
  writes one line (`<file, home as ~> has unread bytes since <ISO> (last line read <ISO or the start>)`) with
  `process.stderr.write(line, cb)` and sends itself SIGKILL in `cb`; a 1 s timer sends it too in case the callback
  never comes. No `server.close()`, no `process.exit()` on this path. SIGINT/SIGTERM still close gracefully.
- **Trades.** A log Lens can never read (permissions, a broken file) now restarts Lens every 30 minutes; a restart
  cannot fix that, but each restart's line names the file. SIGKILL skips pending work: the history is committed per
  read, so at most the last read is read again, and `INSERT OR IGNORE` makes that harmless. The exit is now
  killed-by-signal, not 1; launchd `KeepAlive` restarts both, and run by hand the shell shows "Killed".
- **Known limit.** A log that appears and whose very first read hangs is never placed, so it is not tracked. In the
  stuck-thread shape the other followed logs fall behind too, so Lens is still caught.
- **Test settings.** `NIGHTSHIFT_STALE_MS` and `NIGHTSHIFT_WATCHDOG_MS` let a test make the built command stale fast.

## A stale Lens restarts itself (2026-11-09)

- **Why.** Lens froze again: it read its last line on 2026-11-07 at 16:20 and `/health` said "stale" for two days.
  The error log showed every file, the newest sessions too, as "no answer after 120 s". Node reads files on a pool of
  4 threads; reads that never come back hold all 4, so every later read only waits in line. Passing a stuck file over
  (below) frees nothing. A restart read everything at once. The first stuck read was not caught this time either.
- **The fix is a new process.** The CLI checks `engine.health()` every minute (`watchdog` in `watcher/health.ts`).
  On the first "stale" it writes one line to the error log and ends itself (since 2026-11-17: SIGKILL, not exit 1,
  see the entry above); the service (launchd `KeepAlive`, `com.zontak.lens`) starts a fresh Lens, which carries on
  from the saved offsets. A quiet computer never restarts.
- **Not chosen.** A bigger thread pool (`UV_THREADPOOL_SIZE`) only delays the same jam.

## Honest health (2026-11-07)

- **Why.** Lens ran from 2026-11-01 20:25 and stopped reading at 23:49 the same night; for five days the board said
  "last active Nov 1" and `/health` said ok. The process was alive (timers ran, the meter was fresh), used no CPU and
  held no log file open, and reported no error. A fresh copy on the same logs and history read the 125 MB backlog of
  the 171 MB session at once, so the big file did not cause it by itself; the look loop simply never ran again. The
  exact stuck call was not caught (attaching a debugger to the live process was not allowed).
- **Stale = work nobody read.** Since 2026-11-17 (entry above): a followed log has had unread bytes for 30 minutes.
  The first rule here (no line read for 30 minutes and a `.jsonl` with a new mtime) took a touch for work and was
  replaced. A quiet computer is never stale. The body gives `lastLineAt` and `lastChangeAt` (ISO) so a monitor can say since when.
- **The probe does not trust the watcher.** It lists and stats the logs with SYNC calls on the request (a few hundred
  stats, milliseconds), so a stuck background read cannot also hang the health answer. The watcher's listing uses the
  same sync code (`watcher/files.ts`); since 2026-11-18 the file reads are sync too ("Logs are read with sync calls").
- **No file can stop the others.** Reads are sync since 2026-11-18, so a look always returns ("Logs are read with
  sync calls", above); a file that fails is reported once (not every second) and retried; at most `chunkBytes`
  (8 MB) of one file are read per look, so a huge backlog is caught up over several looks and never held whole.
  A file that failed keeps the place chosen for it, so a retry never reads its old history as new.
- **Known limit (no longer holds).** Since 2026-11-17 stale is per file: one log whose bytes stay unread for 30
  minutes (unreadable, stuck) does make `/health` stale and restarts Lens, even while the others are read.

## Lens: ready for strangers (2026-11-06)

- **The rename is words only.** Night Shift is now Lens and Night Watch is Sentinel on screen, in the terminal, in the
  README and in the doc comments a reader sees first. Identifiers, file names, the folder, the repo, the `nightshift`
  command, `~/.nightshift`, `nightshift.db` and the `NIGHTSHIFT_*` settings keep the old name: renaming them is a
  separate decision (it breaks installs and links).
- **The owner's names (2026-10-27):** Day Shift -> Forge, Night Shift -> Lens, Night Watch -> Sentinel (Motherboard
  stays). Only words a person reads change; identifiers keep the old names. This entry and "Spyglass: the public
  name (2026-11-21)" are the only docs that hold the old-to-new mapping; `test/old-names.ts` lists the old names and the tests keep them off the screens and docs.
- 2026-11-14: the GitHub repo is now zontak-ai/lens (was nightshift); the npm name, the command, ~/.nightshift and NIGHTSHIFT_* keep the old name.
- 2026-11-23: the GitHub org was renamed to zontak-ai; every link in this repo uses the new name (GitHub forwards old links only until the old name is claimed).
- **Empty defaults.** A new install pins nothing (`projects.json` is created as `[]`, a damaged one falls back to `[]`)
  and there is no built-in Sentinel site: a project links to a site only through its line's `watchSite`. Recent repos
  under `~/Projects` and busy projects still show by themselves. The old defaults named our own projects, which a
  stranger does not have.
- **Our list lives in our own `projects.json`.** `scripts/fill-watch-sites.mjs <file> <folder=site>...` adds the
  `watchSite` that the old built-in sites gave (backup first, never drops or reorders a line, a second run changes
  nothing); the names are typed on the command line only, never committed.
- **Sentinel is named without a link** while its repo is private: a link would be a 404 for strangers.
  `test/readme.test.ts` guards the README (check-rules does not scan it). Add the link when that repo is public.
