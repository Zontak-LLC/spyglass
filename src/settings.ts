/** Reads one setting by its short name (`PORT`, `LOGS`, ...): its value, or `undefined` when it is not set. */
export type Setting = (name: string) => string | undefined;

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
