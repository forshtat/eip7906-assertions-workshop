/**
 * STEP 10 — Challenge: write your own assertion in Solidity.
 *
 *   yarn step_10_challenge    test the assertion you wrote in contracts/challenge/MyVaultAssertion.sol
 *   yarn step_10_solution     run the reference solution (contracts/solutions/OwnerUnchangedAssertion.sol)
 *
 * We check your assertion twice with free dry-runs (nothing is sent until you get both right):
 *   ✔ setSecret(42)               must be allowed
 *   ✔ transferOwnership(attacker) must be blocked
 * Then, if you got both right, the blocked attack is sent for real so you can see it fail on-chain.
 */
import { encodeFunctionData } from "viem";
import { deployOnce } from "../lib/chain.js";
import { compileSol } from "../lib/compile.js";
import { ATTACKER, VaultC } from "../lib/contracts.js";
import { dryRun, me, run } from "../lib/scenario.js";
import { postTx, selfVerify, senderCall } from "../lib/frameTx.js";
import { say, title, ok, bad } from "../lib/output.js";
import { startStep } from "../lib/progress.js";

const useSolution = process.argv.includes("--solution");
title(
  useSolution
    ? "Step 10: reference solution (contracts/solutions/OwnerUnchangedAssertion.sol)"
    : "Step 10: your assertion (contracts/challenge/MyVaultAssertion.sol)",
);
startStep(10);

let compiled;
try {
  compiled = useSolution
    ? compileSol("solutions/OwnerUnchangedAssertion.sol", "OwnerUnchangedAssertion")
    : compileSol("challenge/MyVaultAssertion.sol", "MyVaultAssertion");
} catch (e) {
  bad("Your Solidity assertion does not compile yet:");
  say((e as Error).message);
  process.exit(1);
}

const vault = await deployOnce(me.key, "vault", VaultC.bytecode);
const assertion = await deployOnce(me.key, useSolution ? "ownerUnchangedSolution" : "myAssertion", compiled.bytecode);
const args = encodeFunctionData({
  abi: compiled.abi,
  functionName: "assertOwnerUnchanged",
  args: [vault],
});
const call = (functionName: "setSecret" | "transferOwnership", arg: bigint | `0x${string}`) =>
  senderCall(vault, encodeFunctionData({ abi: VaultC.abi, functionName, args: [arg] } as any), 0n, 100_000n, 300_000n);

const legit = [selfVerify(), call("setSecret", 42n), postTx(assertion, args)];
const attack = [selfVerify(), call("transferOwnership", ATTACKER), postTx(assertion, args)];

const assertionRan = async (frames: typeof legit) => (await dryRun(frames)).frames.at(-1)!.succeeded;
const allowsLegit = await assertionRan(legit);
const blocksAttack = !(await assertionRan(attack));

(allowsLegit ? ok : bad)("setSecret(42) is allowed" + (allowsLegit ? "" : "  ← your assertion reverts on a harmless update"));
(blocksAttack ? ok : bad)("transferOwnership(attacker) is blocked" + (blocksAttack ? "" : "  ← the vault would be stolen"));

if (allowsLegit && blocksAttack) {
  say("\nBoth right. Sending the attack for real, to watch it fail on-chain:");
  await run(attack);
  say("\n  The owner slot is untouched: the vault is still yours. 🎉");
  say("\nThat's the workshop. Ideas to keep going: protect slot 1 with a maximum value, forbid new contract");
  say("deployments (`TxTrace.CODES_DEPLOYED`), or combine this with the assertions from steps 4 to 6.");
} else {
  say("\nNot there yet. Edit contracts/challenge/MyVaultAssertion.sol and run this again.");
  process.exitCode = 1;
}
