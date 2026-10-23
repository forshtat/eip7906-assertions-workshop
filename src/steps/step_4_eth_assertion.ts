/**
 * STEP 4 — Your first assertion: "I will not spend more than X ETH".
 *
 * EIP-7906 adds a new frame mode, POST_TX (mode 3). A POST_TX frame:
 *   - runs AFTER all the other frames (it must be at the end of the frame list),
 *   - is read-only (a STATICCALL, so it cannot change anything),
 *   - may use the new TXTRACE opcode to look at what the transaction just did,
 *   - and if it REVERTS, the body of the transaction is rolled back.
 *
 * "Rolled back" is the important part. The tx stays valid and included (status 0), the VERIFY frame's
 * effects (nonce, gas payment) are kept, so the block builder still gets paid. Only the damage is undone.
 *
 * See `contracts/assertions/EthSpendLimitAssertion.sol` (and `contracts/shared/HegotaLibrary.sol`).
 * `TXTRACE(param, index)` is a "state diff viewer". The params used in `EthSpendLimitAssertion.sol`:
 *    BALANCE_COUNT        how many addresses changed balance
 *    BALANCE_ADDRESS[i]   which address entry i is
 *    BALANCE_BEFORE[i]    its balance at the start of the tx
 *    BALANCE_AFTER[i]     its balance right now (after the body)
 *    GAS_PAYER / GAS_PRECHARGE   who pre-paid gas, and how much
 *
 * One subtlety: the gas payer is charged the *maximum* possible gas up front. That shows up as a
 * balance change, so the assertion subtracts it, otherwise every tx looks like it spends too much.
 *
 * Scenario: a dapp bundles an extra 0.5 ETH transfer to an attacker into the batch you sign.
 */
import { encodeFunctionData, parseEther } from "viem";
import { deployOnce, eth } from "../lib/chain.js";
import { ATTACKER, EthSpendLimitAssertionC } from "../lib/contracts.js";
import { holdings, me, run, showChange, swapFrame, world } from "../lib/scenario.js";
import { postTx, selfVerify, senderCall } from "../lib/frameTx.js";
import { say, title, next, ok } from "../lib/output.js";

title("Step 4: an ETH spend limit (contracts/assertions/EthSpendLimitAssertion.sol)");
const { usdw, honestDex } = world();
const assertion = await deployOnce(me.key, "ethSpendLimit", EthSpendLimitAssertionC.bytecode);
say(`Assertion contract: ${assertion}`);

const limit = parseEther("0.011"); // "this swap is 0.01 ETH, allow a little slack"
const args = encodeFunctionData({
  abi: EthSpendLimitAssertionC.abi,
  functionName: "assertMaxEthSpend",
  args: [me.address, limit],
});

say("\n① The honest swap (spends 0.01 ETH) with the assertion attached:");
let before = await holdings();
const good = await run([selfVerify(), swapFrame(honestDex, usdw), postTx(assertion, args)]);
let after = await holdings();
showChange(before, after);
if (good.status === "0x1") ok("Assertion passed, swap went through.");

say("\n② The same swap, but the dapp has slipped in a 0.5 ETH transfer to the attacker:");
before = after;
await run([
  selfVerify(),
  swapFrame(honestDex, usdw),
  senderCall(ATTACKER, "0x", parseEther("0.5"), 50_000n, 200_000n), // <- the part you didn't read
  postTx(assertion, args),
]);
after = await holdings();
showChange(before, after);
say(`\n  Frames 1 and 2 report success, frame 3 (the assertion) failed, and the whole body was undone:`);
say(`  no swap, no 0.5 ETH transfer. The only ETH you lost is gas: ${eth(before.eth - after.eth)}.`);
next("step_5_token_assertion");
