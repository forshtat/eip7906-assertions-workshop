/**
 * In-process Solidity compiler (`solc-js`) that compiles `.sol` files directly from `contracts/`
 * on disk. Relative imports resolve inside `contracts/`; `@forshtat/hegota-support/...` imports resolve to the installed
 * @forshtat/hegota-support package (HegotaSupport and its parameter enums).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

const solc = createRequire(import.meta.url)("solc");
const CONTRACTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../contracts");
const HEGOTA_FRAMES = "@forshtat/hegota-support/";
const HEGOTA_FRAMES_DIR = path.dirname(createRequire(import.meta.url).resolve("@forshtat/hegota-support/package.json"));

export interface CompiledContract {
  abi: any[];
  bytecode: Hex;
}

const fileCache = new Map<string, Record<string, any>>();

function compileFile(relPath: string): Record<string, any> {
  const cached = fileCache.get(relPath);
  if (cached) return cached;

  const fullPath = path.resolve(CONTRACTS_DIR, relPath);
  const content = readFileSync(fullPath, "utf8");

  const input = JSON.stringify({
    language: "Solidity",
    sources: { [relPath]: { content } },
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  });

  const findImports = (importPath: string) => {
    try {
      if (importPath.startsWith(HEGOTA_FRAMES)) {
        return { contents: readFileSync(path.join(HEGOTA_FRAMES_DIR, importPath.slice(HEGOTA_FRAMES.length)), "utf8") };
      }
      const resolved = path.resolve(CONTRACTS_DIR, importPath);
      if (!resolved.startsWith(CONTRACTS_DIR)) return { error: `Import outside contracts/: ${importPath}` };
      return { contents: readFileSync(resolved, "utf8") };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const out = JSON.parse(solc.compile(input, { import: findImports }));
  const errors = (out.errors ?? []).filter((e: any) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: any) => e.formattedMessage).join("\n"));

  const contractsInFile = out.contracts?.[relPath] ?? {};
  fileCache.set(relPath, contractsInFile);
  return contractsInFile;
}

/**
 * Compile `contracts/<relPath>` and return `{ abi, bytecode }` for `contractName`
 * (defaults to the file's basename without `.sol`).
 */
export function compileSol(relPath: string, contractName?: string): CompiledContract {
  const contractsInFile = compileFile(relPath);
  const targetName = contractName ?? path.basename(relPath, ".sol");
  const c = contractsInFile[targetName] ?? Object.values(contractsInFile)[0];
  if (!c) throw new Error(`Contract "${targetName}" not found in contracts/${relPath}`);
  return { abi: c.abi ?? [], bytecode: `0x${c.evm.bytecode.object}` };
}
