// The watcher layer: follows Claude Code's session logs (read only) and hands each new line to the parser.

export { type Backlog, backlogStep, backlogTracker, oldestUnread } from "./backlog.js";
export { type LogFile, logFiles, newestChange } from "./files.js";
export { watchLogs } from "./follow.js";
export { type Health, healthOf, STALE_MS, WATCHDOG_EVERY_MS, watchdog } from "./health.js";
export { advance, START, startAt, type TailState } from "./tail.js";
