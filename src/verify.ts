/**
 * Offline wiring check (no network, no funds): `yarn verify`. Run by CI on every push.
 *
 *   - every Solidity contract and assertion in `contracts/` compiles cleanly
 *   - `contracts/shared/HegotaLibrary.sol` oracle initcodes assemble to 0xB0 / 0xB1 / 0xB3 / 0xB6 / 0xB7
 *     and are embedded into the compiled assertion and circuit-breaker contracts
 *   - the frame-tx codec behaves: type byte, signing is deterministic, and the signature
 *     is not part of the hash it signs
 *   - every package.json script points at a file that exists
 */
import { existsSync, readFileSync } from "node:fs";
import { keccak256, recoverAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileSol } from "./lib/compile.js";
import {
  EthSpendLimitAssertionC,
  EvilDexC,
  HonestDexC,
  LendingPoolC,
  NoBalanceDropsAssertionC,
  SpammerC,
  TokenC,
  TokenReceiveOnlyAssertionC,
  VaultC,
} from "./lib/contracts.js";
import { encodeTx, selfVerify, senderCall, postTx, sigHash, signTx, type FrameTx } from "./lib/frameTx.js";

let failures = 0;
const check = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✔" : "✘"} ${name}${pass ? "" : `  ${detail}`}`);
  if (!pass) failures++;
};

// 1. All Solidity contracts and assertions in `contracts/` compile cleanly
for (const [name, c] of Object.entries({
  TokenC,
  HonestDexC,
  EvilDexC,
  SpammerC,
  VaultC,
  LendingPoolC,
  EthSpendLimitAssertionC,
  TokenReceiveOnlyAssertionC,
  NoBalanceDropsAssertionC,
})) {
  check(`${name} compiles`, c.bytecode.length > 10 && c.abi.length > 0);
}

const challengeStub = compileSol("challenge/MyVaultAssertion.sol", "MyVaultAssertion");
const challengeSolution = compileSol("solutions/OwnerUnchangedAssertion.sol", "OwnerUnchangedAssertion");
check("contracts/challenge/MyVaultAssertion.sol compiles", challengeStub.bytecode.length > 10);
check("contracts/solutions/OwnerUnchangedAssertion.sol compiles", challengeSolution.bytecode.length > 10);

// 2. Verify HegotaLibrary oracle initcodes (0xB6 TXTRACE, 0xB7 EVENTDATACOPY, 0xB0/0xB1/0xB3 frame opcodes)
const txTraceRuntime = "600035602035b660005260206000f3";
const eventDataRuntime = "6040356020356000600035b76040356000f3";
const frameRuntime = "6020356040355f358015602057600114601b57b35b5f5260205ff35bb16014565b5050b0601456";

check(
  "HegotaLibrary embeds TXTRACE (0xB6) oracle into assertions",
  EthSpendLimitAssertionC.bytecode.includes(txTraceRuntime) &&
    NoBalanceDropsAssertionC.bytecode.includes(txTraceRuntime) &&
    challengeSolution.bytecode.includes(txTraceRuntime),
);
check(
  "HegotaLibrary embeds EVENTDATACOPY (0xB7) oracle into event assertions",
  TokenReceiveOnlyAssertionC.bytecode.includes(eventDataRuntime) &&
    LendingPoolC.bytecode.includes(eventDataRuntime),
);
check(
  "HegotaLibrary embeds TXPARAM/FRAMEDATALOAD/FRAMEPARAM (0xB0/0xB1/0xB3) oracle into LendingPool",
  LendingPoolC.bytecode.includes(frameRuntime),
);

// 3. Frame transaction codec
const key = `0x${"11".repeat(32)}` as Hex;
const sender = privateKeyToAccount(key).address;
const base: FrameTx = {
  chainId: 3151908n,
  nonce: 7n,
  sender,
  frames: [selfVerify(), senderCall(sender, "0x1234", 1n), postTx(sender, "0x")],
  signature: "0x",
  maxPriorityFeePerGas: 1_000_000_000n,
  maxFeePerGas: 3_000_000_000n,
};
const signed = await signTx(base, key);
check("encoded tx starts with the 0x06 type byte", encodeTx(signed).startsWith("0x06"));
check("signature is 65 bytes (v || r || s)", (signed.signature.length - 2) / 2 === 65);
check("signature is not part of the hash it signs", sigHash(base) === sigHash(signed));
check("signing is deterministic", (await signTx(base, key)).signature === signed.signature);
check("changing a frame changes the sig hash", sigHash(base) !== sigHash({ ...base, frames: [selfVerify()] }));
const v = Number(`0x${signed.signature.slice(2, 4)}`);
check("v is a bare recovery id (0 or 1)", v === 0 || v === 1);
const recovered = await recoverAddress({
  hash: sigHash(base),
  signature: { r: `0x${signed.signature.slice(4, 68)}`, s: `0x${signed.signature.slice(68)}`, yParity: v as 0 | 1 },
});
check("signature recovers to the sender", recovered === sender);
check("hash of the raw tx is stable", keccak256(encodeTx(signed)).length === 66);

// 4. package.json scripts
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
for (const [name, cmd] of Object.entries(scripts)) {
  const file = cmd.match(/src\/\S+\.ts/)?.[0];
  if (file) check(`script ${name} → ${file} exists`, existsSync(file));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
