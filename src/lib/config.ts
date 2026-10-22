import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { defineChain, type Address, type Hex } from "viem";

export const CHAIN_ID = 3151908;
export const RPC_URLS = [
  "https://rpc1.hegota.ethrex.xyz",
  "https://rpc2.hegota.ethrex.xyz",
  "https://rpc3.hegota.ethrex.xyz",
];
export const FAUCET_URL = "https://faucet.hegota.ethrex.xyz/api/claim";
export const EXPLORER_URL = "https://dora.hegota.ethrex.xyz";

export const hegota = defineChain({
  id: CHAIN_ID,
  name: "Hegota devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: RPC_URLS } },
});

const ENV_FILE = ".env";

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

/** The RPC every step talks to. Override with RPC_URL in .env. */
export function rpcUrl(): string {
  return process.env.RPC_URL ?? readEnv().RPC_URL ?? RPC_URLS[0];
}

/** Your throwaway workshop key. Created on first use and stored in .env (never reuse it anywhere real). */
export function loadAccount(): { address: Address; key: Hex } {
  let key = (process.env.PRIVATE_KEY ?? readEnv().PRIVATE_KEY) as Hex | undefined;
  if (!key) {
    key = generatePrivateKey();
    const prev = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").replace(/^PRIVATE_KEY=.*\n?/m, "") : "";
    writeFileSync(ENV_FILE, `${prev}PRIVATE_KEY=${key}\n`);
    console.log(`Created a throwaway key and saved it to ${ENV_FILE}`);
  }
  return { address: privateKeyToAccount(key).address, key };
}
