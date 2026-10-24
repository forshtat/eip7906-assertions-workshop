import { createPublicClient, createWalletClient, fallback, formatEther, http, keccak256, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FAUCET_URL, RPC_URLS, hegota, rpcUrl } from "./config.js";
import { readState, writeState } from "./state.js";
import { broadcast, rpc, sleep } from "./rpc.js";
import { encodeTx, newTx, signTx, txHash, type Frame, type FrameTx } from "./frameTx.js";

export const balanceOf = async (a: Address): Promise<bigint> => BigInt(await rpc("eth_getBalance", [a, "latest"]));
export const nonceOf = async (a: Address): Promise<bigint> => BigInt(await rpc("eth_getTransactionCount", [a, "latest"]));
export const eth = (wei: bigint) => `${formatEther(wei)} ETH`;
export const tokens = (wei: bigint) => `${formatEther(wei)}`;

/** ERC-20 balanceOf(who) via a plain eth_call. */
export async function tokenBalance(token: Address, who: Address): Promise<bigint> {
  const data = `0x70a08231${who.slice(2).toLowerCase().padStart(64, "0")}`;
  return BigInt(await rpc("eth_call", [{ to: token, data }, "latest"]));
}

/** Ask the devnet faucet for 1 ETH (rate limited per IP). */
export async function claimFaucet(address: Address) {
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: address.toLowerCase() }),
  });
  return { ok: res.ok, body: (await res.text()).slice(0, 300) };
}

/** Build + sign a frame tx for `account`, with fees from the latest block. */
export async function prepareTx(account: { address: Address; key: Hex }, frames: Frame[]): Promise<FrameTx> {
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const baseFee = BigInt(block.baseFeePerGas ?? "0x3b9aca00");
  const tip = 1_000_000_000n;
  const tx: FrameTx = newTx({
    chainId: BigInt(await rpc("eth_chainId")),
    nonce: await nonceOf(account.address),
    sender: account.address,
    frames,
    maxPriorityFeePerGas: tip,
    maxFeePerGas: baseFee * 2n + tip,
  });
  return signTx(tx, account.key);
}

/** Dry-run on the node without sending (`ethrex_simulateFrameTransaction`). */
export async function simulate(tx: FrameTx) {
  return rpc("ethrex_simulateFrameTransaction", [encodeTx(tx), "latest"]);
}

/** Send the raw tx, wait for the receipt, and re-gossip to the other RPCs if it takes long. */
export async function sendAndWait(tx: FrameTx, timeoutMs = 120_000) {
  const raw = encodeTx(tx);
  const hash = txHash(tx);
  await rpc("eth_sendRawTransaction", [raw]);
  const start = Date.now();
  let rebroadcast = false;
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return { hash, receipt };
    if (!rebroadcast && Date.now() - start > 30_000) {
      rebroadcast = true;
      await broadcast(raw);
    }
    await sleep(2_000);
  }
  throw new Error(`Timed out waiting for ${hash}`);
}

// ---------------------------------------------------------------------------------------------
// Deploying and calling ordinary contracts (plain EIP-1559 transactions are still supported)
// ---------------------------------------------------------------------------------------------
export function clients(key: Hex) {
  const account = privateKeyToAccount(key);
  const urls = [rpcUrl(), ...RPC_URLS.filter((u) => u !== rpcUrl())];
  const transport = fallback(urls.map((u) => http(u, { timeout: 15_000 })));
  return {
    account,
    wallet: createWalletClient({ account, chain: hegota, transport }),
    pub: createPublicClient({ chain: hegota, transport }),
  };
}

/** Deploy creation bytecode and return the new contract's address. */
export async function deploy(key: Hex, bytecode: Hex, args: Hex = "0x"): Promise<Address> {
  const { account, wallet, pub } = clients(key);
  const data = `${bytecode}${args.slice(2)}` as Hex;
  // Creating a contract costs state gas, which grows with its size and with every contract it creates (an assertion
  // creates one helper per opcode), so ask the node rather than guess a limit.
  const gas = ((await pub.estimateGas({ account: account.address, data })) * 12n) / 10n;
  const hash = await wallet.sendTransaction({ data, gas });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);
  return receipt.contractAddress;
}

/** Send an ordinary contract call and wait for it. */
export async function callContract(key: Hex, to: Address, abi: Abi, functionName: string, args: unknown[] = [], value = 0n) {
  const { wallet, pub } = clients(key);
  const hash = await wallet.writeContract({ address: to, abi, functionName, args, value, gas: 500_000n } as any);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`${functionName} failed: ${hash}`);
  return receipt;
}

/**
 * Deploy `bytecode` unless this exact code was already deployed by you (tracked in .workshop-state.json).
 * Edit an assertion and re-run a step: it is redeployed automatically because its bytecode changed.
 */
export async function deployOnce(key: Hex, label: string, bytecode: Hex, args: Hex = "0x"): Promise<Address> {
  const id = keccak256(`${bytecode}${args.slice(2)}` as Hex).slice(0, 18);
  const known = readState()[`deploy:${id}`];
  if (known) return known as Address;
  const address = await deploy(key, bytecode, args);
  writeState({ [`deploy:${id}`]: address, [label]: address });
  return address;
}
