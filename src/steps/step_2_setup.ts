/**
 * STEP 2 — Build the playground.
 *
 * We deploy a tiny DeFi world (source in contracts/Playground.sol):
 *   - USDW        a normal ERC-20 token
 *   - HonestDex   swap(token): you send ETH, you get 1000 tokens per wei. Fair.
 *   - EvilDex     swap(token): *identical calldata*, but it short-changes you and
 *                 sweeps every token you ever approved it for. (A second one swaps fairly and
 *                 only sweeps the SILENT token; we need it in step 6.)
 *
 * Then we play "you, a while ago": you minted 100 USDW and approved BOTH dexes to spend them
 * (people click "approve" all the time). From now on, a transaction that calls
 * `swap(USDW)` is a coin flip you cannot read from the calldata. That is blind signing.
 *
 * These are plain EIP-1559 transactions. Frame transactions come back in step 3.
 */
import { encodeAbiParameters, parseEther } from "viem";
import { callContract, deployOnce, eth, balanceOf, tokenBalance, tokens } from "../lib/chain.js";
import { ATTACKER, EvilDexC, HonestDexC, TokenC } from "../lib/contracts.js";
import { loadAccount } from "../lib/config.js";
import { say, ok, title, next } from "../lib/output.js";
import { readState, writeState } from "../lib/state.js";
import { finishStep, startStep } from "../lib/progress.js";

title("Step 2: deploy the playground");
startStep(2);
const me = loadAccount();
const key = me.key;
const str = (s: string, emit: boolean) =>
  encodeAbiParameters([{ type: "string" }, { type: "bool" }], [s, emit]);

const usdw = await deployOnce(key, "usdw", TokenC.bytecode, str("USDW", true));
const silent = await deployOnce(key, "silent", TokenC.bytecode, str("SILENT (no Transfer events!)", false));
const honest = await deployOnce(key, "honestDex", HonestDexC.bytecode);
const evil = await deployOnce(
  key,
  "evilDex",
  EvilDexC.bytecode,
  encodeAbiParameters([{ type: "address" }, { type: "bool" }, { type: "address[]" }], [ATTACKER, false, [usdw]]),
);
// A second evil dex that swaps fairly but quietly sweeps the silent token instead (used in step 6).
const evilSilent = await deployOnce(
  key,
  "evilDexSilent",
  EvilDexC.bytecode,
  encodeAbiParameters([{ type: "address" }, { type: "bool" }, { type: "address[]" }], [ATTACKER, true, [silent]]),
);
ok(`USDW ${usdw}\n  HonestDex ${honest}\n  EvilDex ${evil}\n  EvilDex (silent-token edition) ${evilSilent}\n  Silent token ${silent}`);

if (!readState().funded) {
  say("\nFunding the world and approving the dexes (a few ordinary transactions, ~10s each) ...");
  const MAX = 2n ** 256n - 1n;
  const mint = (token: typeof usdw, to: string, amt: bigint) => callContract(key, token, TokenC.abi, "mint", [to, amt]);
  await mint(usdw, honest, parseEther("1000000")); //   the honest dex has liquidity
  await mint(usdw, evil, parseEther("1")); //           the evil one has a little bait
  await mint(usdw, evilSilent, parseEther("1000000")); // it swaps fairly, so it needs liquidity too
  await mint(usdw, me.address, parseEther("100")); //   you hold 100 USDW
  await mint(silent, me.address, parseEther("100")); // and 100 SILENT
  for (const token of [usdw, silent]) for (const dex of [evil, evilSilent]) {
    await callContract(key, token, TokenC.abi, "approve", [dex, MAX]); // the old approvals
  }
  writeState({ funded: "yes" });
}

say(
  `\nYou hold: ${eth(await balanceOf(me.address))} (gas money), ${tokens(await tokenBalance(usdw, me.address))} USDW, ${tokens(await tokenBalance(silent, me.address))} SILENT`,
);
ok("Playground ready");
finishStep(2);
next("step_3_blind_signing");
