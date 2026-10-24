/**
 * The steps build on each other (step 5 deploys what steps 6 to 8 use), and everything deployed belongs to the key that
 * ran step 1. So:
 *   - step 1 always resets the workshop: it deletes `.workshop-state.json` and records your address in a fresh one
 *   - every other step refuses to run unless the steps it needs have finished, and unless your key is still the one
 *     step 1 recorded
 */
import { loadAccount } from "./config.js";
import { bad, say } from "./output.js";
import { readState, resetState, writeState } from "./state.js";

/** Which steps must have finished before each step can run. */
export const PREREQUISITES: Record<number, number[]> = {
  1: [],
  2: [1],
  3: [2],
  4: [2],
  5: [2],
  6: [5],
  7: [4, 5, 6],
  8: [5],
  9: [2],
};

export const STEP_COMMAND: Record<number, string> = {
  1: "step_1_check",
  2: "step_2_setup",
  3: "step_3_blind_signing",
  4: "step_4_eth_assertion",
  5: "step_5_token_assertion",
  6: "step_6_state_assertion",
  7: "step_7_compose",
  8: "step_8_gas_griefing",
  9: "step_9_challenge",
};

const parse = (csv: string | undefined) => (csv ? csv.split(",").map(Number) : []);

/** Why `step` cannot run now, or `null`. Pure, so `yarn verify` can test it. */
export function blockedReason(step: number, state: { account?: string; completedSteps?: string }, currentAccount: string): string | null {
  if (!state.account) return `The workshop has not been set up. Run \`yarn ${STEP_COMMAND[1]}\` first.`;
  if (state.account.toLowerCase() !== currentAccount.toLowerCase()) {
    return (
      `Your key (${currentAccount}) is not the one step 1 set this workshop up for (${state.account}). ` +
      `Everything deployed so far belongs to that key. Run \`yarn ${STEP_COMMAND[1]}\` again: it resets the workshop for your current key.`
    );
  }
  const done = parse(state.completedSteps);
  const missing = PREREQUISITES[step]!.filter((p) => !done.includes(p));
  if (missing.length === 0) return null;
  return `Step ${step} needs ${missing.map((m) => `step ${m}`).join(" and ")} to have finished first. Run, in this order: ${missing.map((m) => `yarn ${STEP_COMMAND[m]}`).join(", ")}.`;
}

/** Call at the top of a step, after its title. Step 1 resets the workshop; any other step stops here when it is blocked. */
export function startStep(step: number) {
  const { address } = loadAccount();
  if (step === 1) {
    resetState();
    writeState({ account: address, completedSteps: "" });
    return;
  }
  const reason = blockedReason(step, readState(), address);
  if (reason) {
    bad(reason);
    process.exit(1);
  }
}

/** Call when a step has done everything it is for. */
export function finishStep(step: number) {
  const done = new Set(parse(readState().completedSteps));
  done.add(step);
  writeState({ completedSteps: [...done].sort((a, b) => a - b).join(",") });
  say("");
}
