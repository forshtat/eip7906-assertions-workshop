/**
 * STEP 5 — Read the events: "I must receive at least N tokens, and none may leave".
 *
 * ETH balances are easy (step 4). For tokens, the natural thing to inspect is the event log.
 * TXTRACE can walk every event the body emitted:
 *
 *    EVENTS_COUNT                total number of events
 *    EVENT_ADDRESS[i]            which contract emitted event i
 *    EVENT_TOPIC_COUNT[i]        how many topics it has
 *    EVENT_TOPIC0..2[i]          the topics (asking for a topic that doesn't exist halts!)
 *
 * and EVENTDATACOPY(i, memOffset, dataOffset, length) copies bytes of event i's non-indexed data into
 * memory. For an ERC-20 `Transfer(address indexed from, address indexed to, uint256 value)` the amount
 * is the first data word.
 *
 * Heads-up: ETH transfers are logged as Transfer-shaped events too, emitted by the system address
 * 0xff..fe. That is how an assertion can see ETH moves in the event stream; here we skip them,
 * because step 4 already polices ETH.
 *
 * This assertion is deliberately a *receive-only* policy for a swap: nothing may leave your account.
 */
import { encodeAbiParameters, parseEther } from "viem";
import { deployOnce } from "../lib/chain.js";
import { yul } from "../lib/compile.js";
import { holdings, me, resetHoldings, run, showChange, swapFrame, world } from "../lib/scenario.js";
import { postTx, selfVerify } from "../lib/frameTx.js";
import { say, title, next, ok } from "../lib/output.js";

// ─────────────────────────────  THE ASSERTION  ─────────────────────────────
// calldata: owner (address), token (address), minReceived (uint256)
const TOKEN_RECEIVE_ONLY = yul("TokenReceiveOnly", `
  let owner := calldataload(0)
  let token := calldataload(32)
  let minReceived := calldataload(64)

  let SYSTEM := 0xfffffffffffffffffffffffffffffffffffffffe
  let TRANSFER := 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef

  let received := 0
  let n := txtrace(EVENTS_COUNT(), 0)
  for { let i := 0 } lt(i, n) { i := add(i, 1) } {
    // Transfer(from, to, value) has exactly 3 topics: the signature and the two indexed addresses.
    if eq(txtrace(EVENT_TOPIC_COUNT(), i), 3) {
      if eq(txtrace(EVENT_TOPIC0(), i), TRANSFER) {
        let emitter := txtrace(EVENT_ADDRESS(), i)
        if iszero(eq(emitter, SYSTEM)) {
          // Nothing of yours may leave, in any token.
          if eq(txtrace(EVENT_TOPIC1(), i), owner) { revert(0, 0) }

          // Count what arrives in the token you expected.
          if eq(txtrace(EVENT_TOPIC2(), i), owner) {
            if eq(emitter, token) {
              eventdatacopy(i, 0, 0, 32)
              received := add(received, mload(0))
            }
          }
        }
      }
    }
  }
  if lt(received, minReceived) { revert(0, 0) }
`);
// ───────────────────────────────────────────────────────────────────────────

title("Step 5: a token assertion built on events");
const { usdw, honestDex, evilDex } = world();
await resetHoldings();
const assertion = await deployOnce(me.key, "tokenReceiveOnly", TOKEN_RECEIVE_ONLY.bytecode);
say(`Assertion contract: ${assertion}`);

// "0.01 ETH should get me about 10 USDW; I'll accept 9.9"
const args = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }, { type: "uint256" }],
  [me.address, usdw, parseEther("9.9")],
);

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
