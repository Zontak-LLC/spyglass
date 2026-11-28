# Spyglass

A live screen for your Claude Code agents: what they are doing right now, and what they did overnight.

![The Spyglass board for a demo project: the NOW strip and the background agents](docs/screenshot.png)

> Status: works day to day: Board, Terminal and Timeline tabs, `GET /agents`. Not on npm yet. The usage
> meter and the link to Sentinel live in Motherboard now. See [docs/SPEC.md](docs/SPEC.md).

## Install and run

You need Node 22 or newer.

```bash
git clone https://github.com/zontak-ai/spyglass && cd spyglass
npm install && npm run build
npm start
```

Then open http://localhost:4400. The terminal shows the same steps, one line each:

```
21:04:07  demo-app           Editing src/login.ts
21:04:12  demo-app           Running npm test
21:04:31  demo-app           ⇪ pull request #42
```

`curl -N localhost:4400/events` gives the same steps as a live stream (Server-Sent Events).

## What it reads and writes

Spyglass runs on your own computer. It has no accounts, no server and no telemetry: **nothing leaves your computer.**
- It **reads** Claude Code's logs in `~/.claude/projects`, and nothing else.
- It **writes** only to `~/.nightshift`: its history (`nightshift.db`) and your project list (`projects.json`).
- The service listens on 127.0.0.1 only and answers only pages on this computer.

## Settings

`SPYGLASS_PORT` (default 4400), `SPYGLASS_LOGS` (default `~/.claude/projects`), `SPYGLASS_DATA` (where the
history is kept, default `~/.nightshift`) and `SPYGLASS_KEEP_DAYS` (default 30, 1 to 3650; anything else means 30, with a warning). `SPYGLASS_STALE_MS` (default 1800000, 30 minutes:
how long a log's bytes may wait unread before Spyglass counts as stale and restarts) and `SPYGLASS_WATCHDOG_MS` (default
60000: how often it checks) exist mostly for tests; anything that is not a positive whole number means the default.

The start page shows the git repositories directly under `~/Projects` that Claude worked in during the last 30 days,
and any project that is busy right now. To pin projects, name them or hide one, edit `~/.nightshift/projects.json`
(created empty on the first run):

```json
[
  { "path": "~/Projects/my-app", "name": "My App" },
  { "path": "~/Projects/shop-app", "name": "Shop App" },
  { "path": "~/Projects/old-thing", "hide": true }
]
```

`name` is what the tile and the board title say (the board address uses the folder name); `hide` removes a repo that
was added by itself. Other keys are ignored, so a line from an older Spyglass still loads. A damaged file falls back to an
empty list and says so in the log. Times show in the browser's local time.

## History

Spyglass keeps what it saw in one SQLite file (`~/.nightshift/nightshift.db`). Stop and start it: the board comes back as
it was, each log file is read on from where it stopped (a file that was replaced or cut short is read again from its
top), and no step is shown or stored twice. Sessions that have been quiet for more than 30 days are removed, once an
hour. The file holds your prompts' first lines and tool summaries: it stays on your computer, and only your account can
read `~/.nightshift`: each time Spyglass starts it sets the folder to 0700 and the history files to 0600.

## Background agents

Claude Code runs helpers ("subagents") in the background. Spyglass follows their logs too
(`<session>/subagents/agent-*.jsonl`, with the name from `agent-*.meta.json`). Each helper is filed under the project
it **really works in**, not the folder its parent session started in: the git repository most of its tool calls touch
(`cd`, `git -C`, file paths). A linked worktree counts as its main repository and is marked "(worktree)". With no
clear repository it stays under its parent's project. The Board tab lists them under the NOW strip, which says
"3 agents working", the Terminal tab streams their steps tagged with the agent's name, and the Timeline draws a bar
for each. The start page lists projects that only helpers touched.

### Projects

A session is filed by where its steps work, not only by the folder it started in: a session started in `demo-app`
that edits files in `my-app` shows on the `my-app` board too (steps split per repository; a step that names no folder
stays at home). Idle projects stay on the start page, dimmer.

## Run it in the background

Run it as a service, so the computer starts it again whenever it stops. Run these from this folder, after
`npm run build`; the here-docs fill in your own paths.

Set it up under an older name? Stop that service first, so two do not fight over port 4400: `launchctl bootout gui/$(id -u)/dev.lens` on macOS, `systemctl --user disable --now lens` on Linux.

macOS (a LaunchAgent; the log goes to `~/Library/Logs/spyglass.log`):

```bash
cat > ~/Library/LaunchAgents/dev.spyglass.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.spyglass</string>
  <key>ProgramArguments</key>
  <array><string>$(command -v node)</string><string>$PWD/dist/cli.js</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/spyglass.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/spyglass.log</string>
</dict>
</plist>
EOF
touch ~/Library/Logs/spyglass.log && chmod 600 ~/Library/Logs/spyglass.log   # only you can read the log
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.spyglass.plist   # start
tail -f ~/Library/Logs/spyglass.log                                          # follow the log
launchctl bootout gui/$(id -u)/dev.spyglass                                  # stop (it saves its place and closes the file)
```

Linux (a systemd user unit; the log goes to your own journal):

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/spyglass.service <<EOF
[Unit]
Description=Spyglass, a live screen for Claude Code agents

[Service]
ExecStart=$(command -v node) $PWD/dist/cli.js
Restart=always

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now spyglass    # start, and start again at every login
journalctl --user -u spyglass -f          # follow the log
systemctl --user stop spyglass            # stop (it saves its place and closes the file)
```

Check it on either:

```bash
curl -s localhost:4400/health   # {"ok":true,"status":"ok","lastLineAt":"…","unreadSince":null}; 503 "stale" when it fell behind
```

The log holds steps, titles and file names, never the prompts you type, and only you can read it. The service must
start Spyglass again: a Spyglass that falls behind (`/health` says "stale") kills itself so a fresh one can take over.

## Work on it

```bash
npm install
npm run ci                       # everything CI runs: rules, lint, types, tests with coverage
npm run dev                      # the command, restarting on every change
node scripts/demo-board.mjs      # Spyglass on invented demo data (the screenshot above), in temporary folders
```

- [docs/SPEC.md](docs/SPEC.md): what it is, what is in and out, and the scenarios that prove it.
- [docs/decisions.md](docs/decisions.md): the decision tree, every choice and why.
- [CLAUDE.md](CLAUDE.md): how the code is laid out and the rules it keeps.

## Name

Spyglass was called Lens, and before that Night Shift; old NIGHTSHIFT_* settings still work (with one warning each) and ~/.nightshift keeps its name for now.

## Licence

MIT, see [LICENSE](LICENSE).
