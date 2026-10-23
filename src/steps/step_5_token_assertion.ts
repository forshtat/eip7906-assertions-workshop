/**
 * STEP 5 — Read the events: "I must receive at least N tokens, and none may leave".
 *
 * ETH balances are easy (step 4). For tokens, the natural thing to inspect is the event log.
 * See `contracts/assertions/TokenReceiveOnlyAssertion.sol`: `HegotaLibrary.query` walks every event
 * the body emitted:
 *
 *    EVENT_COUNT                total number of events
 *    EVENT_ADDRESS[i]           which contract emitted event i
 *    EVENT_TOPIC_CNT[i]         how many topics it has
 *    EVENT_TOPIC0..2[i]         the topics (asking for a topic that doesn't exist halts!)
 *
 * and `HegotaLibrary.getEventData(edOracle, i, dataOffset, length)` uses `EVENTDATACOPY` to copy
 * bytes of event i's non-indexed data. For an ERC-20 `Transfer(address indexed from, address indexed to, uint256 value)`
 * the amount is the first 32-byte word.
 *
 * Heads-up: ETH transfers are logged as Transfer-shaped events too, emitted by the system address
 * 0xff..fe. That is how an assertion can see ETH moves in the event stream; here we skip them,
 * because step 4 already polices ETH.
 *
 * This assertion is deliberately a *receive-only* policy for a swap: nothing may leave your account.
 */
import { encodeFunctionData, parseEther } from "viem";
import { deployOnce } from "../lib/chain.js";
import { TokenReceiveOnlyAssertionC } from "../lib/contracts.js";
import { holdings, me, resetHoldings, run, showChange, swapFrame, world } from "../lib/scenario.js";
import { postTx, selfVerify } from "../lib/frameTx.js";
import { say, title, next, ok } from "../lib/output.js";

title("Step 5: a token assertion built on events (contracts/assertions/TokenReceiveOnlyAssertion.sol)");
const { usdw, honestDex, evilDex } = world();
await resetHoldings();
const assertion = await deployOnce(me.key, "tokenReceiveOnly", TokenReceiveOnlyAssertionC.bytecode);
say(`Assertion contract: ${assertion}`);

// "0.01 ETH should get me about 10 USDW; I'll accept 9.9"
const args = encodeFunctionData({
  abi: TokenReceiveOnlyAssertionC.abi,
  functionName: "assertTokenReceiveOnly",
  args: [me.address, usdw, parseEther("9.9")],
});

say("\n① Honest dex + assertion:");
let before = await holdings();
const good = await run([selfVerify(), swapFrame(honestDex, usdw), postTx(assertion, args)]);
let after = await holdings();
showChange(before, after);
if (good.status === "0x1") ok("Received 10 USDW, nothing left. Assertion passed.");

say("\n② Evil dex + the same assertion (this is the step 3 attack):");
before = after;
await resetHoldings();
before = await holdings();
await run([selfVerify(), swapFrame(evilDex, usdw), postTx(assertion, args)]);
after = await holdings();
showChange(before, after);
say("\n  The evil dex tried to short-change you and sweep your approved USDW. Both show up as Transfer");
say("  events, the assertion saw them, and the whole body was undone. You only paid gas.");
next("step_6_state_assertion");
