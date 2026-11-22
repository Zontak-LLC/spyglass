// The store layer: the board's state (and later the SQLite history). See SPEC section 7 and CLAUDE.md.
export { Board, type BoardView, type NowRow, type ProjectRow } from "./board.js";
export type { Desk, DeskState, DesksView, DeskTokens } from "./desks.js";
export { DAY_MS, DEFAULT_KEEP_DAYS, type FileState, History } from "./history.js";
export { expand, loadPinned, type Pinned, projectTiles, type Tile } from "./pinned.js";
export { repoOf } from "./repo.js";
export { type RepoRoot, repoRootOf } from "./root.js";
export type { Alert, Trouble } from "./trouble.js";
export type { AgentRow } from "./workers.js";
