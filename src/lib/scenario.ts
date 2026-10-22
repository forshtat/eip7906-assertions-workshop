/** Shared plumbing for the demo scenarios, so each step file can stay about the interesting part. */
import { encodeFunctionData, parseEther, type Address } from "viem";
import { balanceOf, callContract, eth, sendAndWait, tokenBalance, tokens, prepareTx, simulate } from "./chain.js";
import { HonestDexC, TokenC } from "./contracts.js";
import { loadAccount } from "./config.js";
import { requireState } from "./state.js";
import { senderCall, type Frame, type FrameTx } from "./frameTx.js";
import { say, showFrames, explorer } from "./output.js";

export const me = loadAccount();
export const world = () => requireState("usdw", "silent", "honestDex", "evilDex", "evilDexSilent");

/** "swap 0.01 ETH for USDW" as a SENDER frame. Honest and evil dexes share this exact calldata. */
export function swapFrame(dex: Address, tokenOut: Address, ethIn = parseEther("0.01")): Frame {
  const data = encodeFunctionData({ abi: HonestDexC.abi, functionName: "swap", args: [tokenOut] });
  // 400k state gas = room for the new storage slots / accounts the swap may create.
  return senderCall(dex, data, ethIn, 400_000n, 600_000n);
}

/** Top your tokens back up to 100 each, so every attack step starts from the same place. */
export async function resetHoldings() {
  const { usdw, silent } = world();
  for (const token of [usdw, silent]) {
    const have = await tokenBalance(token, me.address);
    if (have < parseEther("100")) await callContract(me.key, token, TokenC.abi, "mint", [me.address, parseEther("100") - have]);
  }
}

export interface Holdings { eth: bigint; usdw: bigint; silent: bigint }
export async function holdings(): Promise<Holdings> {
  const { usdw, silent } = world();
  return { eth: await balanceOf(me.address), usdw: await tokenBalance(usdw, me.address), silent: await tokenBalance(silent, me.address) };
}

const sign = (n: bigint, f: (x: bigint) => string) => (n === 0n ? "±0" : n > 0n ? `+${f(n)}` : `-${f(-n)}`);
export function showChange(before: Holdings, after: Holdings) {
  say(`  ETH    ${eth(after.eth).padEnd(28)} (${sign(after.eth - before.eth, (x) => eth(x))}, includes gas)`);
  say(`  USDW   ${tokens(after.usdw).padEnd(28)} (${sign(after.usdw - before.usdw, tokens)})`);
  say(`  SILENT ${tokens(after.silent).padEnd(28)} (${sign(after.silent - before.silent, tokens)})`);
}

/** Send a frame tx for real and print what happened to each frame. Returns the receipt. */
export async function run(frames: Frame[]) {
  const tx: FrameTx = await prepareTx(me, frames);
  const { hash, receipt } = await sendAndWait(tx);
  say(`\n  tx ${hash}\n  ${explorer(hash)}`);
  showFrames(tx, receipt.frameReceipts);
  say(`  overall status: ${receipt.status === "0x1" ? "success" : "FAILED (status 0)"}, payer ${receipt.payer.slice(0, 10)}…`);
  return receipt;
}

/** Free dry-run on the node. Same frames, nothing is sent. */
export async function dryRun(frames: Frame[]) {
  const tx = await prepareTx(me, frames);
  const sim = await simulate(tx);
  return { tx, sim, frames: sim.frames as { succeeded: boolean; gasUsed: string }[] };
}
