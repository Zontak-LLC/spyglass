import { DEFAULT_KEEP_DAYS } from "./store/index.js";

const MIN_KEEP_DAYS = 1;
const MAX_KEEP_DAYS = 3650;

/** Reads one setting by its short name (`PORT`, `LOGS`, ...): its value, or `undefined` when it is not set. */
type Setting = (name: string) => string | undefined;

/**
 * Makes a settings reader over `env`. `setting("PORT")` returns `SPYGLASS_PORT`, or the old `NIGHTSHIFT_PORT` when the
 * new one is unset or empty, or `undefined` when both are. An empty value counts as unset, as a service file's `X=`
 * line usually means "not set". Using an old name calls `warn` once per name for the life of the reader, so an install
 * from before the rename keeps working and its log says what to change without repeating it. Never throws.
 */
export function readSettings(env: NodeJS.ProcessEnv, warn: (message: string) => void): Setting {
  const warned = new Set<string>();
  return (name) => {
    const current = env[`SPYGLASS_${name}`];
    if (current) return current;
    const old = env[`NIGHTSHIFT_${name}`];
    if (!old) return undefined;
    if (!warned.has(name)) {
      warned.add(name);
      warn(`NIGHTSHIFT_${name} is the old name; use SPYGLASS_${name}`);
    }
    return old;
  };
}

/**
 * How many days of history to keep, from the text of `SPYGLASS_KEEP_DAYS`: a whole number from 1 to 3650. Unset or
 * empty text gives the default with no reason; anything else out of range gives the default and a `reason` naming
 * the value, for one warning line. Never throws.
 */
export function keepDaysOf(text: string | undefined): { days: number; reason?: string } {
  if (!text) return { days: DEFAULT_KEEP_DAYS };
  const days = Number(text);
  if (Number.isSafeInteger(days) && days >= MIN_KEEP_DAYS && days <= MAX_KEEP_DAYS) return { days };
  return {
    days: DEFAULT_KEEP_DAYS,
    reason: `SPYGLASS_KEEP_DAYS "${text}" is not a whole number of days from ${MIN_KEEP_DAYS} to ${MAX_KEEP_DAYS}; using ${DEFAULT_KEEP_DAYS}`,
  };
}
