/**
 * STEP 8 — Attacking the assertion itself: gas griefing.
 *
 * Our event-reading assertion (`contracts/assertions/TokenReceiveOnlyAssertion.sol`) loops over EVERY
 * event in the transaction. The attacker controls the body, so the attacker controls how many events
 * there are. Pad the body with junk events and the loop gets longer and longer.
 *
 * What happens if the assertion runs out of gas? An out-of-gas halt is just a failed POST_TX frame, so
 * the body is rolled back. That is "failing closed": the attacker cannot sneak a bad tx past you this
 * way, but CAN make your good tx fail (griefing), and you still pay for the gas.
 *
 * Two lessons:
 *   1. Budget the POST_TX frame from the *body's* gas limit. Every event costs the body ~1000 gas to
 *      emit, so a body with a given gas limit can only make so many; the assertion spends ~1,150 gas on each (measured below).
 *   2. Prefer assertions whose cost doesn't grow with attacker-controlled data (e.g. look up one
 *      slot, don't enumerate everything).
 *
 * We send the same honest-swap-plus-300-junk-events twice: with a tight POST_TX gas limit and a roomy one.
 */
import { encodeFunctionData, parseEther } from "viem";
import { deployOnce } from "../lib/chain.js";
import { SpammerC, TokenReceiveOnlyAssertionC } from "../lib/contracts.js";
import { me, resetHoldings, run, swapFrame, world } from "../lib/scenario.js";
import { postTx, selfVerify, senderCall } from "../lib/frameTx.js";
import { say, title, next, ok, bad } from "../lib/output.js";
import { finishStep, startStep } from "../lib/progress.js";

title("Step 8: gas griefing");
startStep(8);
const { usdw, honestDex } = world();
const tokenReceiveOnly = await deployOnce(me.key, "tokenReceiveOnly", TokenReceiveOnlyAssertionC.bytecode);
const spammer = await deployOnce(me.key, "spammer", SpammerC.bytecode);
await resetHoldings();

const args = encodeFunctionData({
  abi: TokenReceiveOnlyAssertionC.abi,
  functionName: "assertTokenReceiveOnly",
  args: [me.address, usdw, parseEther("9.9")],
});
const body = [
  swapFrame(honestDex, usdw),
  senderCall(spammer, encodeFunctionData({ abi: SpammerC.abi, functionName: "spam", args: [300n] }), 0n, 600_000n),
];

say("\n① 300 junk events, POST_TX gas limit 30,000 (looks generous for a 1-event tx):");
const tight = await run([selfVerify(), ...body, postTx(tokenReceiveOnly, args, 30_000n)]);
if (tight.status !== "0x1") bad("The assertion ran out of gas, so the whole tx (a perfectly honest swap) was rolled back.");

say("\n② Same transaction, POST_TX gas limit 500,000:");
const roomy = await run([selfVerify(), ...body, postTx(tokenReceiveOnly, args, 500_000n)]);
if (roomy.status === "0x1") ok(`Passes. Look at the POST_TX gas used above: that is what 300 extra events cost the assertion.`);
finishStep(8);
next("step_9_circuit_breaker");
