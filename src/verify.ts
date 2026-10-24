/**
 * Offline wiring check (no network, no funds): `yarn verify`. Run by CI on every push.
 *
 *   - every demo contract and the step 9 challenge files compile
 *   - an assertion compiles against HegotaSupport and its TXTRACE and EVENTDATACOPY helpers are the 0xB6 / 0xB7 opcodes
 *   - a frame transaction built here is a type 0x06 transaction, signs deterministically and recovers to its sender
 *     (the codec itself is tested in hegota-frames)
 *   - every package.json script points at a file that exists
 */
import { existsSync, readFileSync } from "node:fs";
import { recoverAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileAssertion } from "./lib/compile.js";
import { HonestDexC, EvilDexC, SpammerC, TokenC, VaultC } from "./lib/contracts.js";
import { MY_ASSERTION } from "./challenge/my_assertion.js";
import { OWNER_UNCHANGED } from "./solutions/owner_unchanged.js";
import { blockedReason, PREREQUISITES } from "./lib/progress.js";
import { encodeTx, newTx, selfVerify, senderCall, postTx, sigHash, signTx } from "./lib/frameTx.js";

let failures = 0;
const check = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✔" : "✘"} ${name}${pass ? "" : `  ${detail}`}`);
  if (!pass) failures++;
};

// contracts: importing ./lib/contracts.js already compiled them; make sure each produced code
for (const [name, c] of Object.entries({ TokenC, HonestDexC, EvilDexC, SpammerC, VaultC })) {
  check(`${name} compiles`, c.bytecode.length > 10);
}

// assertions
const all = compileAssertion("Params", "txtrace(0, TxTrace.GAS_PAYER); eventdatacopy(0, 0, 32);");
check("an assertion compiles against HegotaSupport", all.bytecode.length > 10);
check("it carries the TXTRACE helper (0xb6)", all.bytecode.includes("b6"));
check("it carries the EVENTDATACOPY helper (0xb7)", all.bytecode.includes("b7"));
check("step 9 challenge stub compiles", compileAssertion("Stub", MY_ASSERTION).bytecode.length > 10);
check("step 9 solution compiles", compileAssertion("Solution", OWNER_UNCHANGED).bytecode.length > 10);

// transactions
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

// step order
const me = "0x00000000000000000000000000000000000000a1";
check("before step 1 nothing can run", blockedReason(2, {}, me) !== null);
check("step 2 can run after step 1", blockedReason(2, { account: me, completedSteps: "1" }, me) === null);
check("step 6 is blocked until step 5 has finished", blockedReason(6, { account: me, completedSteps: "1,2,4" }, me)?.includes("step 5") === true);
check("step 7 names every missing step", /step 5 and step 6/.test(blockedReason(7, { account: me, completedSteps: "1,2,4" }, me) ?? ""));
check("a different key is blocked, even with every step done", blockedReason(3, { account: me, completedSteps: "1,2" }, "0x00000000000000000000000000000000000000a2")?.includes("not the one step 1") === true);
check("every prerequisite is an earlier step", Object.entries(PREREQUISITES).every(([step, needs]) => needs.every((n) => n < Number(step))));

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
