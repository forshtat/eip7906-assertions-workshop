/**
 * STEP 7 — Compose: many assertions, many authors.
 *
 * A transaction can carry several POST_TX frames. That lets independent parties each contribute a check,
 * with nobody needing to trust (or even know about) the others:
 *
 *    your wallet       → "no more than 0.011 ETH leaves"        (step 4)
 *    the dapp          → "I get my tokens, nothing leaves"       (step 5)
 *    a security vendor → "no ERC-20 balance of mine goes down"   (step 6)
 *
 * Rules worth remembering:
 *   - POST_TX frames form a contiguous suffix: once one appears, every later frame must be POST_TX.
 *   - They run in order. The first one that reverts rolls the body back and the rest are skipped.
 *   - The user's signature covers the whole frame list, so nobody can strip an assertion after you sign.
 *
 * Who makes sure the assertions are actually THERE? For a plain EOA, your wallet builds the frame list.
 * For a smart account, its VERIFY code can require specific assertion frames to be present, which is
 * the robust option: see "Security Considerations" in the EIP.
 */
import { encodeAbiParameters, parseEther } from "viem";
import { holdings, me, resetHoldings, run, showChange, swapFrame, world } from "../lib/scenario.js";
import { postTx, selfVerify, senderCall } from "../lib/frameTx.js";
import { ATTACKER } from "../lib/contracts.js";
import { requireState } from "../lib/state.js";
import { say, title, next, ok } from "../lib/output.js";

title("Step 7: composing assertions");
const { usdw, honestDex, evilDexSilent } = world();
const { ethSpendLimit, tokenReceiveOnly, noBalanceDrops } = requireState("ethSpendLimit", "tokenReceiveOnly", "noBalanceDrops");

const assertions = [
  postTx(ethSpendLimit, encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [me.address, parseEther("0.011")])),
  postTx(
    tokenReceiveOnly,
    encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [me.address, usdw, parseEther("9.9")]),
  ),
  postTx(noBalanceDrops, encodeAbiParameters([{ type: "address" }], [me.address])),
];

say("\n① Honest swap with all three assertions attached:");
await resetHoldings();
let before = await holdings();
const good = await run([selfVerify(), swapFrame(honestDex, usdw), ...assertions]);
let after = await holdings();
showChange(before, after);
if (good.status === "0x1") ok("Three assertions, three passes.");

say("\n② A nasty combination: the silent-token sweeper AND a hidden 0.5 ETH transfer:");
await resetHoldings();
before = await holdings();
const attackFrames = [
  selfVerify(),
  swapFrame(evilDexSilent, usdw),
  senderCall(ATTACKER, "0x", parseEther("0.5"), 50_000n, 200_000n),
  ...assertions,
];
const blocked = await run(attackFrames);
showChange(before, await holdings());
const names = ["ETH spend limit", "token receive-only", "no balance drops"];
const firstAssertion = attackFrames.length - assertions.length;
say("\n  Which assertion caught it?");
names.forEach((name, i) => {
  const receipt = blocked.frameReceipts[firstAssertion + i]; // frames after the first failure get no receipt
  const verdict = !receipt ? "skipped (an earlier assertion already failed)" : receipt.status === "0x1" ? "passed" : "REVERTED";
  say(`   ${name.padEnd(20)} ${verdict}`);
});
say("\n  The first failing assertion stops the run, and the whole body is rolled back, however many");
say("  different things it was doing. Re-order the assertions in the list to see another one catch it first.");
next("step_8_gas_griefing");
