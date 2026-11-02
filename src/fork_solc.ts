/**
 * Compiles contracts/fork/*.sol with the EIP-8141 solc fork (https://github.com/chiranjeev13/solidity) and checks that
 * the EIP-8141 opcodes are really in the bytecode. Offline; never touches the devnet. Not part of `yarn verify`,
 * which must pass without a custom compiler.
 *
 *   yarn compile_fork /path/to/solc     (default: `solc` from PATH, which must be the fork)
 *
 * Output goes to contracts/fork/out/<Name>.json ({ abi, bytecode }), which is not committed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "contracts/fork");
const OUT_DIR = path.join(DIR, "out");
const EXPECTED_OPCODES: Record<string, string[]> = { ForkSolcPostTxGuard: ["TXPARAM", "FRAMEPARAM"] };

const solc = process.argv[2] ?? "solc";
const version = execFileSync(solc, ["--version"], { encoding: "utf8" })
  .split("\n")
  .find((l) => l.startsWith("Version:"));
console.log(`${solc}: ${version}`);

const files = readdirSync(DIR).filter((f) => f.endsWith(".sol"));
const input = {
  language: "Solidity",
  sources: Object.fromEntries(files.map((f) => [f, { content: readFileSync(path.join(DIR, f), "utf8") }])),
  settings: {
    evmVersion: "cancun+eip8141",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.opcodes"] } },
  },
};
const out = JSON.parse(
  execFileSync(solc, ["--standard-json"], { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 1 << 26 }),
);
const errors = (out.errors ?? []).filter((e: any) => e.severity === "error");
if (errors.length) {
  console.error(errors.map((e: any) => e.formattedMessage).join("\n"));
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, contracts] of Object.entries<Record<string, any>>(out.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const expected = EXPECTED_OPCODES[name] ?? [];
    for (const op of expected) {
      if (!new RegExp(`\\b${op}\\b`).test(c.evm.deployedBytecode.opcodes)) throw new Error(`${name}: ${op} is not in the runtime bytecode`);
    }
    writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }, null, 1) + "\n");
    console.log(`ok ${file}:${name}  (${expected.join(", ")} present)`);
  }
}
