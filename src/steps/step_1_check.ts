/**
 * STEP 1 — Check your setup.
 *
 * What happens here:
 *   1. A throwaway key is created for you and saved in .env (only ever use it on this devnet).
 *   2. We ask the devnet faucet for 1 ETH.
 *   3. We build a *frame transaction* (EIP-8141, type 0x06) and dry-run it on the node:
 *        frame 0  VERIFY  — "my own signature authorises this tx and I pay for gas"
 *        frame 1  SENDER  — "send 1 gwei to someone, as me"
 *      Nothing is sent. `ethrex_simulateFrameTransaction` just tells us the node would accept it.
 *
 * If this prints green ticks you are ready for the rest of the workshop.
 */
import { claimFaucet, balanceOf, eth, prepareTx, simulate } from "../lib/chain.js";
import { CHAIN_ID, loadAccount, rpcUrl } from "../lib/config.js";
import { ok, bad, say, title, next, showFrames } from "../lib/output.js";
import { rpc, sleep } from "../lib/rpc.js";
import { selfVerify, senderCall } from "../lib/frameTx.js";

title("Step 1: check your setup");

const chainId = Number(await rpc("eth_chainId"));
if (chainId !== CHAIN_ID) throw new Error(`Wrong chain: got ${chainId}, expected ${CHAIN_ID}`);
ok(`Connected to the Hegota devnet (chain ${chainId}) at ${rpcUrl()}, block ${Number(await rpc("eth_blockNumber"))}`);

const account = loadAccount();
say(`Your address: ${account.address}`);

let balance = await balanceOf(account.address);
if (balance < 100_000_000_000_000_000n) {
  say("Asking the faucet for 1 ETH ...");
  const faucet = await claimFaucet(account.address);
  if (!faucet.ok) bad(`Faucet said: ${faucet.body}`);
  for (let i = 0; i < 20 && (await balanceOf(account.address)) === balance; i++) await sleep(3_000);
  balance = await balanceOf(account.address);
}
if (balance === 0n) throw new Error("No funds. Try again in a minute, or ask the instructor.");
ok(`Balance: ${eth(balance)}`);

const tx = await prepareTx(account, [
  selfVerify(),
  // Sending to a brand-new account creates state, so this frame needs a state-gas budget (last argument).
  senderCall("0x000000000000000000000000000000000000dEaD", "0x", 1_000_000_000n, 50_000n, 200_000n),
]);
const sim = await simulate(tx);
if (!sim.valid) throw new Error(`The node rejected our frame transaction: ${sim.violation}`);
ok(`The node accepts a frame transaction (prefix shape: ${sim.prefixShape}, gas payer: ${sim.payer.slice(0, 10)}…)`);
showFrames(tx, sim.frames);

next("step_2_setup");
