import { MODE, type Frame, type FrameTx } from "./frameTx.js";
import { EXPLORER_URL } from "./config.js";
import { renderExplanation } from "./explain.js";

/** Prints the step title and, for "Step N: ...", the plain-language explanation of that step. */
export const title = (t: string) => {
  console.log(`\n\x1b[1m━━ ${t} ━━\x1b[0m`);
  const n = /^Step (\d+)\b/.exec(t)?.[1];
  const text = n ? renderExplanation(Number(n)) : undefined;
  if (text) console.log(`\n${text}\n`);
};
export const say = (...a: unknown[]) => console.log(...a);
export const ok = (t: string) => console.log(`\x1b[32m✔ ${t}\x1b[0m`);
export const bad = (t: string) => console.log(`\x1b[31m✘ ${t}\x1b[0m`);
export const next = (cmd: string) => console.log(`\nNext: \x1b[36myarn ${cmd}\x1b[0m`);
export const explorer = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;

const MODE_NAME = Object.fromEntries(Object.entries(MODE).map(([k, v]) => [v, k]));
export const frameName = (f: Frame) => `${MODE_NAME[f.mode] ?? f.mode}${f.target ? ` → ${f.target.slice(0, 10)}…` : ""}`;

/** Print one line per frame: what it was, whether it succeeded, how much gas it used. */
export function showFrames(tx: FrameTx, frameReceipts: { status?: string; gasUsed: string; succeeded?: boolean }[]) {
  frameReceipts.forEach((r, i) => {
    const success = r.status !== undefined ? r.status === "0x1" : r.succeeded;
    const mark = success ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m";
    console.log(`  frame ${i}  ${mark}  ${frameName(tx.frames[i]).padEnd(28)} gas ${BigInt(r.gasUsed)}`);
  });
}
