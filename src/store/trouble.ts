import type { NightEvent } from "../parser/index.js";

/** Work stopped by the API: shown until the next real step clears it (ticket 5). */
export type Trouble = {
  reason: "usage_limit" | "connection" | "login" | "api";
  since: string;
  resetsAt: string | null;
  text: string;
};
/** One thing stopped, for the message line: who, why, since when, and when a usage limit resets. */
export type Alert = Trouble & { who: string };
type TroubleEvent = Extract<NightEvent, { kind: "session.trouble" }>;

export const troubleFrom = (e: TroubleEvent): Trouble => ({
  reason: e.reason,
  since: e.at,
  resetsAt: e.resetsAt,
  text: e.text,
});

/** Everything stopped right now: the sessions' trouble, newest first. */
export function alertsOf(sessions: { title: string | null; trouble: Trouble | null }[]): Alert[] {
  const out: Alert[] = [];
  for (const s of sessions) if (s.trouble) out.push({ who: s.title ?? "Session", ...s.trouble });
  return out.sort((a, b) => b.since.localeCompare(a.since));
}
