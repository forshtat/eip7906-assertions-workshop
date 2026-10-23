/**
 * STEP 9 — DeFi Protocol Circuit Breakers: contracts that protect themselves.
 *
 * Up to now, every assertion was attached by the USER (or their wallet) to protect the user's
 * account. But smart contracts holding millions in DeFi reserves have the exact same problem:
 * one subtle bug in a "boring" maintenance or helper function can let an attacker drain the pool.
 *
 * With EIP-8141 and EIP-7906, a DeFi protocol can enforce an unbreakable on-chain Circuit Breaker
 * in two steps:
 *
 *   1. `withAssertion` modifier (EIP-8141 TXPARAM / FRAMEPARAM / FRAMEDATALOAD):
 *      Every public function checks that the outer Frame Transaction includes the protocol's own
 *      POST_TX assertion frame. If a caller omits it, the pool refuses to execute at all.
 *
 *   2. Post-transaction invariant check (POST_TX + TXTRACE):
 *      After the transaction body finishes, the circuit breaker verifies the pool's invariants:
 *        - Solvency: `asset.balanceOf(pool) >= pool.reserves()` (via ordinary STATICCALLs).
 *        - No hidden approvals: walks TXTRACE events to ensure `pool` never emitted a non-zero
 *          `Approval` to any spender (which a view call cannot check without knowing the spender).
 *
 * We test a `LendingPool` (in src/lib/contracts.ts) that has two real bugs lurking alongside
 * its honest `deposit()` function: a `skim()` reserve drain and an `approveRouter()` backdoor.
 */
import { encodeAbiParameters, encodeFunctionData, parseEther } from "viem";
import { callContract, deployOnce, tokenBalance, tokens } from "../lib/chain.js";
import { yul } from "../lib/compile.js";
import { ATTACKER, LendingPoolC, TokenC } from "../lib/contracts.js";
import { me, resetHoldings, run, world } from "../lib/scenario.js";
import { postTx, selfVerify, senderCall } from "../lib/frameTx.js";
import { rpc } from "../lib/rpc.js";
import { readState, writeState } from "../lib/state.js";
import { say, title, next, ok, bad } from "../lib/output.js";

// ─────────────────────────────  THE ASSERTION  ─────────────────────────────
// calldata: pool (address), asset (address)
const POOL_CIRCUIT_BREAKER = yul("PoolCircuitBreaker", `
  let pool := calldataload(0)
  let asset := calldataload(32)

  // ── 1. Frame check: called mid-tx by the pool's withAssertion modifier ──
  // Outside POST_TX mode, verify the transaction carries a POST_TX frame calling
  // this circuit breaker contract with (pool, asset) as its calldata.
  let cur := txparam(TX_CURRENT_FRAME())
  if iszero(eq(frameparam(FRAME_MODE(), cur), MODE_POST_TX())) {
    let found := 0
    let frames := txparam(TX_FRAME_COUNT())
    for { let i := 0 } lt(i, frames) { i := add(i, 1) } {
      if eq(frameparam(FRAME_MODE(), i), MODE_POST_TX()) {
        if eq(frameparam(FRAME_TARGET(), i), address()) {
          if and(eq(framedataload(i, 0), pool), eq(framedataload(i, 32), asset)) {
            found := 1
          }
        }
      }
    }
    if iszero(found) { revert(0, 0) }
    stop()
  }

  // ── 2. Solvency check (POST_TX): asset.balanceOf(pool) >= pool.reserves() ──
  // Ordinary STATICCALLs work inside POST_TX for reading trusted contracts.
  mstore(0, shl(224, 0x75172a8b)) // reserves()
  if iszero(staticcall(gas(), pool, 0, 4, 0, 32)) { revert(0, 0) }
  let recordedReserves := mload(0)

  mstore(0, shl(224, 0x70a08231)) // balanceOf(address)
  mstore(4, pool)
  if iszero(staticcall(gas(), asset, 0, 36, 0, 32)) { revert(0, 0) }
  let actualBalance := mload(0)

  if lt(actualBalance, recordedReserves) { revert(0, 0) }

  // ── 3. Allowance check (POST_TX): no non-zero Approval emitted from pool ──
  // Nobody knows the attacker's spender address in advance, so we use TXTRACE.
  let APPROVAL := 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
  let n := txtrace(EVENTS_COUNT(), 0)
  for { let i := 0 } lt(i, n) { i := add(i, 1) } {
    if eq(txtrace(EVENT_TOPIC_COUNT(), i), 3) {
      if eq(txtrace(EVENT_TOPIC0(), i), APPROVAL) {
        if eq(txtrace(EVENT_TOPIC1(), i), pool) {
          eventdatacopy(i, 0, 0, 32)
          if gt(mload(0), 0) { revert(0, 0) }
        }
      }
    }
  }
`);
// ───────────────────────────────────────────────────────────────────────────

title("Step 9: DeFi protocol circuit breakers");
const { usdw } = world();
await resetHoldings();

const circuitBreaker = await deployOnce(me.key, "poolCircuitBreaker", POOL_CIRCUIT_BREAKER.bytecode);
const cbArgs = (poolAddr: `0x${string}`) =>
  encodeAbiParameters([{ type: "address" }, { type: "address" }], [poolAddr, usdw]);
const pool = await deployOnce(me.key, "lendingPool", LendingPoolC.bytecode, cbArgs(circuitBreaker));
say(`Circuit breaker: ${circuitBreaker}\nLendingPool:     ${pool}`);

const MAX = 2n ** 256n - 1n;
if (readState().poolSeeded !== pool) {
  say("\nSeeding the LendingPool with 500 USDW of reserves and approving it for deposits ...");
  await callContract(me.key, usdw, TokenC.abi, "mint", [pool, parseEther("500")]);
  await callContract(me.key, pool, LendingPoolC.abi, "sync");
  await callContract(me.key, usdw, TokenC.abi, "approve", [pool, MAX]);
  writeState({ poolSeeded: pool });
}

const poolReserves = async () => BigInt(await rpc("eth_call", [{ to: pool, data: "0x75172a8b" }, "latest"]));
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
const breakerFrame = postTx(circuitBreaker, cbArgs(pool));

say("\nInitial pool state:");
await showPool();

say("\n① Calling the pool WITHOUT its circuit breaker POST_TX frame:");
const noBreaker = await run([selfVerify(), poolCall("skim", [ATTACKER, parseEther("500")])]);
await showPool();
if (noBreaker.status !== "0x1") {
  ok("Blocked in frame 1: `withAssertion` saw the missing POST_TX frame (via TXPARAM / FRAMEPARAM) and reverted.");
}

say("\n② Honest deposit(10 USDW) WITH the circuit breaker POST_TX frame attached:");
const depositTx = await run([selfVerify(), poolCall("deposit", [parseEther("10")]), breakerFrame]);
await showPool();
if (depositTx.status === "0x1") {
  ok("Both `withAssertion` and the POST_TX solvency + allowance checks passed.");
}

say("\n③ Exploit #1 — Reserve drain via buggy `skim(attacker, 500 USDW)` WITH the circuit breaker:");
const drainTx = await run([selfVerify(), poolCall("skim", [ATTACKER, parseEther("500")]), breakerFrame]);
await showPool();
if (drainTx.status !== "0x1") {
  bad("Frame 1 (`skim`) succeeded in sending 500 USDW to the attacker ...");
  ok("... but Frame 2 (POST_TX circuit breaker) saw `balanceOf(pool) < reserves` and rolled the whole body back!");
}

say("\n④ Exploit #2 — Allowance backdoor via `approveRouter(usdw, attacker, MAX)` WITH the circuit breaker:");
const approveTx = await run([selfVerify(), poolCall("approveRouter", [usdw, ATTACKER, MAX]), breakerFrame]);
await showPool();
if (approveTx.status !== "0x1") {
  bad("Frame 1 (`approveRouter`) kept `balanceOf(pool) >= reserves` intact while granting an unlimited approval ...");
  ok("... but Frame 2 spotted the `Approval(pool, attacker, MAX)` event via TXTRACE and rolled the body back!");
}

next("step_10_challenge");
