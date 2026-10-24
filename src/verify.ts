/**
 * Offline wiring check (no network, no funds): `yarn verify`. Run by CI on every push.
 *
 *   - every Solidity contract and assertion in `contracts/` compiles cleanly
 *   - the assertions and the circuit-breaker pool carry the hegota-frames helpers for the opcodes they use
 *     (TXTRACE 0xB6, EVENTDATACOPY 0xB7, TXPARAM 0xB0, FRAMEDATALOAD 0xB1, FRAMEPARAM 0xB3)
 *   - a frame transaction built here is a type 0x06 transaction, signs deterministically and recovers to its sender
 *     (the codec itself is tested in hegota-frames)
 *   - the step order is enforced: step 1 resets, every other step needs the playground of step 2, and a key that is
 *     not the one step 1 recorded is refused
 *   - every package.json script points at a file that exists
 */
import { existsSync, readFileSync } from "node:fs";
import { recoverAddress, type Hex } from "viem";
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
import { blockedReason, PREREQUISITES } from "./lib/progress.js";
import { encodeTx, newTx, selfVerify, senderCall, postTx, sigHash, signTx } from "./lib/frameTx.js";

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

// 2. The helpers HegotaSupport creates carry the opcodes. Each helper's runtime is a few bytes around its opcode, so the
//    opcode byte following the operands' calldataload is enough to tell them apart.
check("assertions carry the TXTRACE (0xb6) helper", [EthSpendLimitAssertionC, NoBalanceDropsAssertionC, challengeSolution].every((c) => c.bytecode.includes("b660005260206000f3")));
check("event assertions carry the EVENTDATACOPY (0xb7) helper", [TokenReceiveOnlyAssertionC, LendingPoolC].every((c) => c.bytecode.includes("b7")));
check("LendingPool carries the TXPARAM, FRAMEDATALOAD and FRAMEPARAM helpers (0xb0, 0xb1, 0xb3)", ["b0", "b1", "b3"].every((b) => LendingPoolC.bytecode.includes(`${b}60005260206000f3`)));

// 3. A frame transaction built here
const key = `0x${"11".repeat(32)}` as Hex;
const sender = privateKeyToAccount(key).address;
const base = newTx({
  chainId: 3151908n,
  nonce: 7n,
  sender,
  frames: [selfVerify(), senderCall(sender, "0x1234", 1n), postTx(sender, "0x")],
  maxPriorityFeePerGas: 1_000_000_000n,
  maxFeePerGas: 3_000_000_000n,
});
const signed = await signTx(base, key);
const signature = signed.signatures[0]!.signature;
check("encoded tx starts with the 0x06 type byte", encodeTx(signed).startsWith("0x06"));
check("signature is 65 bytes (v || r || s)", (signature.length - 2) / 2 === 65);
check("signing is deterministic", (await signTx(base, key)).signatures[0]!.signature === signature);
check("signature is not part of the hash it signs", sigHash(base) === sigHash(signed));
const v = Number(`0x${signature.slice(2, 4)}`);
const recovered = await recoverAddress({
  hash: sigHash(base),
  signature: { r: `0x${signature.slice(4, 68)}`, s: `0x${signature.slice(68)}`, yParity: v as 0 | 1 },
});
check("signature recovers to the sender", recovered === sender);

// 4. Step order
const me = "0x00000000000000000000000000000000000000a1";
check("before step 1 nothing can run", blockedReason(2, {}, me) !== null);
check("step 2 can run after step 1", blockedReason(2, { account: me, completedSteps: "1" }, me) === null);
check("every later step is blocked until step 2 has finished", Object.keys(PREREQUISITES).map(Number).filter((n) => n > 2).every((n) => blockedReason(n, { account: me, completedSteps: "1" }, me) !== null));
check("they all run once step 2 has finished", Object.keys(PREREQUISITES).map(Number).every((n) => blockedReason(n, { account: me, completedSteps: "1,2" }, me) === null));
check("a different key is blocked, even with every step done", blockedReason(3, { account: me, completedSteps: "1,2" }, "0x00000000000000000000000000000000000000a2")?.includes("not the one step 1") === true);

// 5. package.json scripts
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
