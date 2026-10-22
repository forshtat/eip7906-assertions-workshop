import { RPC_URLS, rpcUrl } from "./config.js";
import type { Hex } from "viem";

async function post(url: string, method: string, params: unknown[]) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { result?: any; error?: { code: number; message: string; data?: unknown } };
  if (json.error) throw new Error(`${method}: ${json.error.message}${json.error.data ? ` (${JSON.stringify(json.error.data)})` : ""}`);
  return json.result;
}

/**
 * One JSON-RPC call against your configured RPC. Network failures (not JSON-RPC errors) are retried
 * and fail over to the other devnet RPCs, which is safe because every call here is idempotent.
 */
export async function rpc(method: string, params: unknown[] = []) {
  const urls = [rpcUrl(), ...RPC_URLS.filter((u) => u !== rpcUrl())];
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await post(urls[attempt % urls.length], method, params);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith(`${method}:`)) throw e; // the node answered with an error
      lastError = e;
      await sleep(1_000);
    }
  }
  throw lastError;
}

/** Gossip between the devnet nodes is best-effort, so we can re-submit the same raw tx everywhere (idempotent). */
export async function broadcast(rawTx: Hex) {
  await Promise.allSettled(RPC_URLS.filter((u) => u !== rpcUrl()).map((u) => post(u, "eth_sendRawTransaction", [rawTx])));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
