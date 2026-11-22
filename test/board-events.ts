// Real-shaped events for the memory scenarios: what the parser makes of a session's or a background agent's log lines.
import type { NightEvent } from "../src/parser/index.js";
import type { RepoRoot } from "../src/store/index.js";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/** Every path under `/work/<repo>/` belongs to that repository; nothing else does (no disk is read). */
export const fakeRootOf = (path: string): RepoRoot | null => {
  const repo = /^\/work\/([^/]+)/.exec(path)?.[1];
  return repo ? { root: `/work/${repo}`, worktree: false } : null;
};

type Who = { sessionId: string; agentId?: string; at: string };
const base = ({ sessionId, agentId, at }: Who) => ({ at, sessionId, ...(agentId ? { agentId } : {}) });

export const seen = (who: Who, cwd: string): NightEvent => ({
  kind: "session.seen",
  ...base(who),
  cwd,
  branch: "main",
});
export const titled = (who: Who, title: string): NightEvent =>
  who.agentId ? { kind: "agent.title", ...base(who), title } : { kind: "session.title", ...base(who), title };
export const step = (who: Who, id: string, paths: string[]): NightEvent => ({
  kind: "tool.use",
  ...base(who),
  toolUseId: id,
  tool: "Edit",
  summary: `Editing ${id}.ts`,
  paths,
});
export const usage = (who: Who, messageId: string, output = 5): NightEvent => ({
  kind: "turn.usage",
  ...base(who),
  messageId,
  model: "claude-opus-5-5",
  inputTokens: 1,
  outputTokens: output,
  cacheReadTokens: 10,
  cacheWriteTokens: 100,
});
export const ended = (who: Who): NightEvent => ({ kind: "turn.end", ...base(who) });

/**
 * One day's work in one repository: a main session with a title, two steps (one also in `/work/shared`) and two
 * messages, and a background agent with a name, two steps and one message. Every path is new.
 */
export function dayOfWork(repo: string, tag: string, at: string): NightEvent[] {
  const main = { sessionId: `s-${tag}`, at };
  const agent = { ...main, agentId: `a-${tag}` };
  return [
    seen(main, `/work/${repo}`),
    titled(main, `Work on ${repo}`),
    step(main, `m1-${tag}`, [`/work/${repo}/${tag}/one.ts`]),
    step(main, `m2-${tag}`, [`/work/${repo}/${tag}/two.ts`, `/work/shared/${tag}.md`]),
    usage(main, `msg-m1-${tag}`),
    usage(main, `msg-m2-${tag}`),
    seen(agent, `/work/${repo}`),
    { ...titled(agent, `Helper for ${repo}`), at: "" }, // the agent's meta file carries no time
    step(agent, `a1-${tag}`, [`/work/${repo}/${tag}/agent-one.ts`]),
    step(agent, `a2-${tag}`, [`/work/${repo}/${tag}/agent-two.ts`]),
    usage(agent, `msg-a1-${tag}`),
    ended(agent),
  ];
}

/** What one `dayOfWork` adds to `Board.size()`. */
export const DAY_OF_WORK_SIZE = { sessions: 1, agents: 1, desks: 2, places: 2, tokenEntries: 3 };
