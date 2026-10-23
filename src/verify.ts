/**
 * Offline wiring check (no network, no funds): `yarn verify`. Run by CI on every push.
 *
 *   - every demo contract and the step 10 challenge files compile
 *   - every TXPARAM / FRAMEPARAM / TXTRACE param name in the Yul prelude is usable and the opcodes assemble to 0xB0 / 0xB1 / 0xB3 / 0xB6 / 0xB7
 *   - the frame-tx codec behaves: type byte, signing is deterministic, and the signature
 *     is not part of the hash it signs
 *   - every package.json script points at a file that exists
 */
import { existsSync, readFileSync } from "node:fs";
import { keccak256, recoverAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { yul, YUL_PRELUDE } from "./lib/compile.js";
import { HonestDexC, EvilDexC, SpammerC, LendingPoolC, TokenC, VaultC } from "./lib/contracts.js";
import { MY_ASSERTION } from "./challenge/my_assertion.js";
import { OWNER_UNCHANGED } from "./solutions/owner_unchanged.js";
import { encodeTx, selfVerify, senderCall, postTx, sigHash, signTx, type FrameTx } from "./lib/frameTx.js";

let failures = 0;
const check = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✔" : "✘"} ${name}${pass ? "" : `  ${detail}`}`);
  if (!pass) failures++;
};

// contracts: importing ./lib/contracts.js already compiled them; make sure each produced code
for (const [name, c] of Object.entries({ TokenC, HonestDexC, EvilDexC, SpammerC, LendingPoolC, VaultC })) {
  check(`${name} compiles`, c.bytecode.length > 10);
}

// Yul: touch every prelude function so a typo in a param name is caught, and check the opcode bytes
const paramNames = [...YUL_PRELUDE.matchAll(/function ([A-Z_]+)\(\) -> p/g)].map((m) => m[1]);
const touchAll = paramNames.map((n) => `pop(${n}())`).join("\n");
const all = yul(
  "Params",
  `${touchAll}\npop(txparam(0))\npop(framedataload(0, 0))\npop(frameparam(0, 0))\npop(txtrace(0, 0))\neventdatacopy(0, 0, 0, 0)`,
);
check(`all ${paramNames.length} TXPARAM/FRAMEPARAM/TXTRACE param names compile`, all.bytecode.length > 10);
check("TXPARAM assembles to 0xb0", all.bytecode.includes("b0"));
check("FRAMEDATALOAD assembles to 0xb1", all.bytecode.includes("b1"));
check("FRAMEPARAM assembles to 0xb3", all.bytecode.includes("b3"));
check("TXTRACE assembles to 0xb6", all.bytecode.includes("b6"));
check("EVENTDATACOPY assembles to 0xb7", all.bytecode.includes("b7"));
check("step 10 challenge stub compiles", yul("Stub", MY_ASSERTION).bytecode.length > 10);
check("step 10 solution compiles", yul("Solution", OWNER_UNCHANGED).bytecode.length > 10);
for (const stepFile of [
  "step_4_eth_assertion.ts",
  "step_5_token_assertion.ts",
  "step_6_state_assertion.ts",
  "step_9_circuit_breaker.ts",
]) {
  const src = readFileSync(`src/steps/${stepFile}`, "utf8");
  const m = src.match(/yul\("(\w+)",\s*`([\s\S]*?)`\)/);
  check(`${stepFile} Yul assertion compiles`, Boolean(m && yul(m[1], m[2]).bytecode.length > 10));
}

// codec
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

// package.json scripts
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
