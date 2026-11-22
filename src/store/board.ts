import { homedir } from "node:os";
import { basename } from "node:path";
import type { NightEvent } from "../parser/index.js";
import { DeskLog, type DesksView, type DeskTokens, desksOf } from "./desks.js";
import { type NowRow, nowRows, placeStep, type Spot } from "./places.js";
import { type RootOf, repoRootOf } from "./root.js";
import { type Alert, alertsOf, type Trouble, troubleFrom } from "./trouble.js";
import { type AgentRow, Workers } from "./workers.js";

/**
 * The board's live state, built from events alone (no clock, no disk): each main session's place and current step,
 * and the background agents (`workers.ts`). `view(project)` is what one project's board page draws.
 */
export type Session = {
  cwd: string;
  /** The repository the session started in (a subfolder or worktree counts as its main repository), else the cwd. */
  home: string;
  branch: string | null;
  title: string | null;
  lastAt: string;
  trouble: Trouble | null;
  /** Where the session's steps went, by project (its own folder, and any other repository it worked in). */
  places: Map<string, Spot>;
};

export type { NowRow } from "./places.js";
export type BoardView = {
  project: string;
  folder: string | null;
  branch: string | null;
  now: NowRow[];
  /** Background agents working in this project (wherever their parent session started). */
  agents: AgentRow[];
  alerts: Alert[];
};
export type ProjectRow = { project: string; folder: string; lastAt: string; agents: number };
const ownProject = (s: Session) => basename(s.home) || s.home;
const later = (a: string, b: string) => (a > b ? a : b);

export class Board {
  private sessions = new Map<string, Session>();
  private workers: Workers;
  private log = new DeskLog();

  constructor(private readonly rootOf: RootOf = repoRootOf) {
    this.workers = new Workers(rootOf, (id) => this.sessions.get(id)?.cwd ?? null);
  }

  /** The project and name to tag a background agent's step with, or null for the main thread. */
  agentLabel(agentId: string): { project: string; name: string } | null {
    return this.workers.label(agentId);
  }

  /** Applies one event; returns true when something on a board changed. */
  apply(event: NightEvent): boolean {
    this.log.note(event);
    return event.kind !== "turn.usage" && this.applySession(event); // tokens alone never redraw a board page
  }

  private applySession(e: NightEvent): boolean {
    if (e.agentId) return this.workers.apply(e, e.agentId);
    const s = this.sessions.get(e.sessionId);
    if (e.kind === "session.seen") {
      this.sessions.set(e.sessionId, {
        cwd: e.cwd,
        home: this.rootOf(e.cwd)?.root ?? e.cwd,
        branch: e.branch,
        title: s?.title ?? null,
        lastAt: later(s?.lastAt ?? "", e.at),
        trouble: s?.trouble ?? null,
        places: s?.places ?? new Map(),
      });
      return true;
    }
    if (!s) return false;
    s.lastAt = later(s.lastAt, e.at);
    if (e.kind === "tool.use") {
      placeStep(s.places, s.home, e.paths ?? [], this.rootOf, e.summary, e.at);
      s.trouble = null; // real work again: the trouble is over
    } else if (e.kind === "reply" || e.kind === "prompt") {
      if (!s.trouble) return false;
      s.trouble = null; // the conversation goes on (a text-only answer counts): the trouble is over
    } else if (e.kind === "session.title") s.title = e.title;
    else if (e.kind === "session.trouble") s.trouble = troubleFrom(e);
    else return false;
    return true;
  }

  /** The projects with a session or a step in them (any session may work in several), newest first. */
  projects(nowMs = Date.now()): ProjectRow[] {
    const rows = new Map<string, ProjectRow>();
    const row = (project: string, folder: string) => {
      const r = rows.get(project) ?? { project, folder, lastAt: "", agents: 0 };
      rows.set(project, r);
      return r;
    };
    for (const s of this.sessions.values()) {
      const own = row(ownProject(s), s.home);
      own.lastAt = later(own.lastAt, s.lastAt);
      for (const [project, spot] of s.places) {
        const r = row(project, spot.folder);
        r.lastAt = later(r.lastAt, spot.lastAt);
      }
    }
    for (const [project, w] of this.workers.projects(nowMs)) {
      const r = row(project, w.folder);
      r.lastAt = later(r.lastAt, w.lastAt);
      r.agents = w.agents;
    }
    return [...rows.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  /** One desk per live agent on this computer, for Motherboard's Agents tab (`GET /agents`, see desks.ts). */
  desks(nowMs = Date.now(), home = homedir()): DesksView {
    return desksOf(this.deskSource(home), nowMs);
  }

  private deskSource(home: string) {
    const { sessions, workers, log, rootOf } = this;
    return { sessions, workers, log, home, rootOf };
  }

  /** A desk's tokens, null when unknown: kept here until board-kit's `Agent` has a field for them. */
  deskTokens(deskId: string): DeskTokens | null {
    return this.log.get(deskId)?.tokens ?? null;
  }

  /**
   * Forgets what has been quiet since before `cutoffMs`: main sessions (with their places, title and trouble), then
   * background agents and desk marks (with their token counts), so months of work do not stay in memory.
   */
  forget(cutoffMs: number): void {
    for (const [id, s] of this.sessions) if (Date.parse(s.lastAt) < cutoffMs) this.sessions.delete(id);
    const isSessionKept = (id: string) => this.sessions.has(id);
    this.workers.forget(cutoffMs, isSessionKept);
    this.log.forget(cutoffMs, (key) =>
      key.startsWith("main:") ? isSessionKept(key.slice("main:".length)) : this.workers.has(key.slice("agent:".length)),
    );
  }

  /** How much the board holds in memory: sessions, agents, desk marks, their places and their message token counts. */
  size(): { sessions: number; agents: number; desks: number; places: number; tokenEntries: number } {
    let places = 0;
    for (const s of this.sessions.values()) places += s.places.size;
    return { sessions: this.sessions.size, agents: this.workers.size(), places, ...this.log.size() };
  }

  /** One project's board: its newest session's place, what is happening now, and its background agents. */
  view(project: string, nowMs = Date.now()): BoardView {
    // A session shows on its own project's board and on every other repository it worked in (its steps split).
    const mine = [...this.sessions.values()].filter((s) => ownProject(s) === project || s.places.has(project));
    mine.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    const newest = mine.find((s) => ownProject(s) === project);
    const folder = newest?.cwd ?? mine[0]?.places.get(project)?.folder;
    return {
      project,
      folder: folder ?? this.workers.projects(nowMs).get(project)?.folder ?? null,
      branch: newest?.branch ?? null,
      now: nowRows(mine, project)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6),
      agents: this.workers.rows(project, nowMs),
      alerts: alertsOf(mine),
    };
  }
}
