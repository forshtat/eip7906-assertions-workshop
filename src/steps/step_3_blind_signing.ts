/**
 * STEP 3 — Blind signing, live.
 *
 * You open a dapp, it says "Swap 0.01 ETH for USDW" and asks you to sign.
 * What you actually sign is a frame transaction:
 *
 *    frame 0  VERIFY  — your signature approves the tx and gas payment
 *    frame 1  SENDER  — "as you, call dex.swap(USDW) with 0.01 ETH"
 *
 * Neither you nor your wallet can tell from `swap(address)` whether the dex is honest.
 * Below we send the *same* kind of transaction to both dexes, and compare.
 *
 * Takeaway: the transaction tells you what it will CALL, never what it will DO.
 * EIP-7906 lets us add a check on what it DID — next step.
 */
import { holdings, me, resetHoldings, run, showChange, swapFrame, world } from "../lib/scenario.js";
import { selfVerify } from "../lib/frameTx.js";
import { say, title, next, ok, bad } from "../lib/output.js";
import { finishStep, startStep } from "../lib/progress.js";

title("Step 3: blind signing");
startStep(3);
const { usdw, honestDex, evilDex } = world();
await resetHoldings();

say("\n① An honest dex. 0.01 ETH should buy 10 USDW:");
let before = await holdings();
await run([selfVerify(), swapFrame(honestDex, usdw)]);
let after = await holdings();
showChange(before, after);
if (after.usdw - before.usdw === 10n * 10n ** 18n) ok("Got exactly what the UI promised.");

say("\n② The evil dex. Same calldata, same ETH, same two frames:");
before = after;
await run([selfVerify(), swapFrame(evilDex, usdw)]);
after = await holdings();
showChange(before, after);
bad(`You paid 0.01 ETH, received 1 wei of USDW, and lost ${(before.usdw / 10n ** 18n).toString()} USDW to a stale approval.`);

say("\nThe tx was valid, signed and included. Nothing 'went wrong' as far as the protocol is concerned.");
finishStep(3);
next("step_4_eth_assertion");
