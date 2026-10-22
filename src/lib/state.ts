import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".workshop-state.json";

/** Addresses of everything deployed so far (shared between steps). */
export type State = Record<string, string>;

export const readState = (): State => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {});
export const writeState = (patch: State) => writeFileSync(FILE, JSON.stringify({ ...readState(), ...patch }, null, 2));

export function requireState(...keys: string[]): Record<string, `0x${string}`> {
  const s = readState();
  const missing = keys.filter((k) => !s[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} in ${FILE}. Run the earlier steps first, in order (yarn step_1_check, step_2_setup, ...).`);
  return Object.fromEntries(keys.map((k) => [k, s[k]])) as Record<string, `0x${string}`>;
}
