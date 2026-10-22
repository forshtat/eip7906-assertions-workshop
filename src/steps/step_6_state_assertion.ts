/**
 * STEP 6 — Events can lie. State diffs can't.
 *
 * Step 5's assertion trusted the event log. But events are just things a contract CHOOSES to emit.
 * A malicious or merely non-standard token can move balances without a single Transfer event.
 *
 * Here the second evil dex swaps FAIRLY (you get your 10 USDW, so there is nothing to complain about)
 * and quietly sweeps your SILENT token, which never emits events. We try three things:
 *
 *   ① the step 5 event assertion      → passes, you are robbed anyway
 *   ② a storage-diff assertion        → blocks it
 *   ③ the storage-diff assertion on an honest swap → passes (no false alarm)
 *
 * The storage-diff assertion uses TXTRACE's slot views:
 *    SLOTS_CHANGED        how many (contract, slot) pairs changed
 *    SLOT_KEY[i]          the slot's key
 *    SLOT_BEFORE/AFTER[i] its value before the tx / right now
 *
 * An ERC-20 keeps balances in `mapping(address => uint256) balanceOf` at slot 0 (this is true for
 * OpenZeppelin tokens too), so your balance lives at keccak256(abi.encode(you, 0)) *in every token*.
 * One assertion covers every such token, without knowing their addresses in advance.
 *
 * (It is still a heuristic: a token with a different layout would slip past it. Real wallets would
 * combine several assertions. That is the subject of step 7.)
 */
import { encodeAbiParameters, parseEther } from "viem";
import { deployOnce } from "../lib/chain.js";
import { yul } from "../lib/compile.js";
import { holdings, me, resetHoldings, run, showChange, swapFrame, world } from "../lib/scenario.js";
import { postTx, selfVerify } from "../lib/frameTx.js";
import { requireState } from "../lib/state.js";
import { say, title, next, ok, bad } from "../lib/output.js";

// ─────────────────────────────  THE ASSERTION  ─────────────────────────────
// calldata: owner (address)
const NO_BALANCE_DROPS = yul("NoBalanceDrops", `
  let owner := calldataload(0)

  // slot of balanceOf[owner] for any ERC-20 that keeps balances at slot 0
  mstore(0, owner)
  mstore(32, 0)
  let balanceSlot := keccak256(0, 64)

  let n := txtrace(SLOTS_CHANGED(), 0)
  for { let i := 0 } lt(i, n) { i := add(i, 1) } {
    if eq(txtrace(SLOT_KEY(), i), balanceSlot) {
      // some contract's balanceOf[owner] changed: it may only go up
      if lt(txtrace(SLOT_AFTER(), i), txtrace(SLOT_BEFORE(), i)) { revert(0, 0) }
    }
  }
`);
// ───────────────────────────────────────────────────────────────────────────

title("Step 6: events can lie, state diffs can't");
const { usdw, honestDex, evilDexSilent } = world();
const { tokenReceiveOnly } = requireState("tokenReceiveOnly"); // deployed by step 5
const eventArgs = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }, { type: "uint256" }],
  [me.address, usdw, parseEther("9.9")],
);
const stateArgs = encodeAbiParameters([{ type: "address" }], [me.address]);
const stateAssertion = await deployOnce(me.key, "noBalanceDrops", NO_BALANCE_DROPS.bytecode);

say("\n① The fair-looking evil dex, protected only by the step 5 event assertion:");
await resetHoldings();
let before = await holdings();
const r1 = await run([selfVerify(), swapFrame(evilDexSilent, usdw), postTx(tokenReceiveOnly, eventArgs)]);
let after = await holdings();
showChange(before, after);
if (r1.status === "0x1") bad("The assertion passed and you lost your SILENT tokens. No event was ever emitted for them.");

say("\n② Same attack, protected by the storage-diff assertion:");
await resetHoldings();
before = await holdings();
await run([selfVerify(), swapFrame(evilDexSilent, usdw), postTx(stateAssertion, stateArgs)]);
after = await holdings();
showChange(before, after);
say("  The storage slot holding your SILENT balance went down, so the assertion reverted everything.");

say("\n③ Honest dex with the storage-diff assertion (no false alarm):");
before = after;
const r3 = await run([selfVerify(), swapFrame(honestDex, usdw), postTx(stateAssertion, stateArgs)]);
after = await holdings();
showChange(before, after);
if (r3.status === "0x1") ok("Balances only went up, assertion passed.");
next("step_7_compose");
