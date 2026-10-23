/**
 * STEP 9 — DeFi Protocol Circuit Breakers: contracts that protect themselves.
 *
 * Up to now, every assertion was attached by the USER (or their wallet) to protect the user's
 * account. But smart contracts holding millions in DeFi reserves have the exact same problem:
 * one subtle bug in a "boring" maintenance or helper function can let an attacker drain the pool.
 *
 * See `contracts/LendingPool.sol` (and `contracts/shared/HegotaLibrary.sol`). With EIP-8141 and
 * EIP-7906, `LendingPool` enforces an unbreakable on-chain Circuit Breaker on itself in two steps:
 *
 *   1. `withAssertion` modifier (`containsValidAssertion()`):
 *      Every state-changing function uses `HegotaLibrary.txParam` / `frameParam` / `frameDataLoad`
 *      to verify that the enclosing Frame Transaction includes a `POST_TX` frame calling
 *      `pool.postTransactionAssertion()`. If a caller omits it, the pool refuses to execute at all.
 *
 *   2. `postTransactionAssertion()` (`POST_TX` + `HegotaLibrary.query` / `getEventData`):
 *      After the transaction body finishes, the pool checks its own high-level invariants:
 *        - Solvency: `asset.balanceOf(address(this)) >= reserves`
 *        - No hidden approvals: walks `TXTRACE` events to ensure `pool` never emitted a non-zero
 *          `Approval` to any spender (which a view call cannot check without knowing the spender).
 *
 * `LendingPool` has two real bugs lurking alongside its honest `deposit()` function:
 * a `skim()` reserve drain and an `approveRouter()` backdoor. Let's try both!
 */
import { encodeAbiParameters, encodeFunctionData, parseEther } from "viem";
import { callContract, deployOnce, tokenBalance, tokens } from "../lib/chain.js";
import { ATTACKER, LendingPoolC, TokenC } from "../lib/contracts.js";
import { me, resetHoldings, run, world } from "../lib/scenario.js";
import { postTx, selfVerify, senderCall } from "../lib/frameTx.js";
import { rpc } from "../lib/rpc.js";
import { readState, writeState } from "../lib/state.js";
import { say, title, next, ok, bad } from "../lib/output.js";

title("Step 9: DeFi protocol circuit breakers (contracts/LendingPool.sol)");
const { usdw } = world();
await resetHoldings();

const pool = await deployOnce(
  me.key,
  "lendingPool",
  LendingPoolC.bytecode,
  encodeAbiParameters([{ type: "address" }], [usdw]),
);
say(`LendingPool: ${pool}`);

const MAX = 2n ** 256n - 1n;
if (readState().poolSeeded !== pool) {
  say("\nSeeding the LendingPool with 500 USDW of reserves and approving it for deposits ...");
  await callContract(me.key, usdw, TokenC.abi, "mint", [pool, parseEther("500")]);
  await callContract(me.key, pool, LendingPoolC.abi, "sync");
  await callContract(me.key, usdw, TokenC.abi, "approve", [pool, MAX]);
  writeState({ poolSeeded: pool });
}

const poolReserves = async () => {
  const data = encodeFunctionData({ abi: LendingPoolC.abi, functionName: "reserves" });
  return BigInt(await rpc("eth_call", [{ to: pool, data }, "latest"]));
};
const poolAllowanceToAttacker = async () => {
  const data = encodeFunctionData({ abi: TokenC.abi, functionName: "allowance", args: [pool, ATTACKER] });
  return BigInt(await rpc("eth_call", [{ to: usdw, data }, "latest"]));
};
const showPool = async () => {
  const [bal, res, allow] = await Promise.all([tokenBalance(usdw, pool), poolReserves(), poolAllowanceToAttacker()]);
  say(`  Pool USDW balance: ${tokens(bal).padEnd(10)} | recorded reserves: ${tokens(res).padEnd(10)} | attacker allowance: ${tokens(allow)}`);
};

const poolCall = (functionName: "deposit" | "skim" | "approveRouter", args: readonly unknown[]) =>
  senderCall(pool, encodeFunctionData({ abi: LendingPoolC.abi, functionName, args } as any), 0n, 300_000n, 400_000n);
const breakerFrame = postTx(
  pool,
  encodeFunctionData({ abi: LendingPoolC.abi, functionName: "postTransactionAssertion" }),
);

say("\nInitial pool state:");
await showPool();

say("\n① Calling the pool WITHOUT its circuit breaker POST_TX frame:");
const noBreaker = await run([selfVerify(), poolCall("skim", [ATTACKER, parseEther("500")])]);
await showPool();
if (noBreaker.status !== "0x1") {
  ok("Blocked in frame 1: `withAssertion` saw the missing POST_TX frame (via HegotaLibrary frame opcodes) and reverted.");
}

say("\n② Honest deposit(10 USDW) WITH `pool.postTransactionAssertion()` attached as a POST_TX frame:");
const depositTx = await run([selfVerify(), poolCall("deposit", [parseEther("10")]), breakerFrame]);
await showPool();
if (depositTx.status === "0x1") {
  ok("Both `withAssertion` and `postTransactionAssertion()` (solvency + allowance checks) passed.");
}

say("\n③ Exploit #1 — Reserve drain via buggy `skim(attacker, 500 USDW)` WITH the circuit breaker:");
const drainTx = await run([selfVerify(), poolCall("skim", [ATTACKER, parseEther("500")]), breakerFrame]);
await showPool();
if (drainTx.status !== "0x1") {
  bad("Frame 1 (`skim`) succeeded in sending 500 USDW to the attacker ...");
  ok("... but Frame 2 (`postTransactionAssertion()`) saw `balanceOf(pool) < reserves` and rolled the whole body back!");
}

say("\n④ Exploit #2 — Allowance backdoor via `approveRouter(usdw, attacker, MAX)` WITH the circuit breaker:");
const approveTx = await run([selfVerify(), poolCall("approveRouter", [usdw, ATTACKER, MAX]), breakerFrame]);
await showPool();
if (approveTx.status !== "0x1") {
  bad("Frame 1 (`approveRouter`) kept `balanceOf(pool) >= reserves` intact while granting an unlimited approval ...");
  ok("... but Frame 2 spotted the `Approval(pool, attacker, MAX)` event via TXTRACE and rolled the body back!");
}

next("step_10_challenge");
