/**
 * In-process compilers (solc-js), so there is no toolchain to install.
 *  - `solidity()` for ordinary contracts (tokens, dapps)
 *  - `yul()` for assertions: Solidity can't emit the EIP-7906 opcodes, but Yul's `verbatim` can.
 */
import { createRequire } from "node:module";
import type { Hex } from "viem";

const solc = createRequire(import.meta.url)("solc");

function compile(language: "Solidity" | "Yul", name: string, content: string): { abi: any[]; bytecode: Hex } {
  const out = JSON.parse(
    solc.compile(
      JSON.stringify({
        language,
        sources: { [`${name}.${language === "Yul" ? "yul" : "sol"}`]: { content } },
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: language === "Solidity", runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
    ),
  );
  const errors = (out.errors ?? []).filter((e: any) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: any) => e.formattedMessage).join("\n"));
  const file = Object.values(out.contracts)[0] as Record<string, any>;
  const c = file[name] ?? Object.values(file)[0];
  return { abi: c.abi ?? [], bytecode: `0x${c.evm.bytecode.object}` };
}

export const solidity = (name: string, source: string) => compile("Solidity", name, source);

/**
 * Names for the EIP-8141 and EIP-7906 opcodes as Yul functions (ethrex Hegota devnet allocation):
 *   TXPARAM        0xB0  stack [param]
 *   FRAMEDATALOAD  0xB1  stack [offset (top), frameIndex]
 *   FRAMEPARAM     0xB3  stack [frameIndex (top), param]
 *   TXTRACE        0xB6  stack [in2 (top), param]
 *   EVENTDATACOPY  0xB7  stack [event_index (top), memOffset, dataOffset, length]
 * TXPARAM / FRAMEDATALOAD / FRAMEPARAM work in any frame of a frame transaction.
 * TXTRACE / EVENTDATACOPY only work inside a POST_TX frame; anywhere else they halt with InvalidOpcode.
 */
export const YUL_PRELUDE = `
  function txparam(param) -> v { v := verbatim_1i_1o(hex"b0", param) }
  function framedataload(frameIndex, offset) -> v { v := verbatim_2i_1o(hex"b1", offset, frameIndex) }
  function frameparam(param, frameIndex) -> v { v := verbatim_2i_1o(hex"b3", frameIndex, param) }
  function txtrace(param, in2) -> v { v := verbatim_2i_1o(hex"b6", in2, param) }
  function eventdatacopy(eventIndex, memOffset, dataOffset, length) {
    verbatim_4i_0o(hex"b7", eventIndex, memOffset, dataOffset, length)
  }

  // TXPARAM / FRAMEPARAM params (EIP-8141)
  function TX_FRAME_COUNT() -> p { p := 0x09 }
  function TX_CURRENT_FRAME() -> p { p := 0x0a }
  function FRAME_TARGET() -> p { p := 0x00 }
  function FRAME_GAS_LIMIT() -> p { p := 0x01 }
  function FRAME_MODE() -> p { p := 0x02 }
  function FRAME_DATA_LEN() -> p { p := 0x04 }
  function MODE_POST_TX() -> p { p := 0x03 }

  // TXTRACE params (EIP-7906)
  function BALANCES_CHANGED() -> p { p := 0x00 }
  function SLOTS_CHANGED() -> p { p := 0x01 }
  function CODES_DEPLOYED() -> p { p := 0x02 }
  function BALANCE_ADDRESS() -> p { p := 0x03 }
  function BALANCE_BEFORE() -> p { p := 0x04 }
  function BALANCE_AFTER() -> p { p := 0x05 }
  function SLOT_ADDRESS() -> p { p := 0x06 }
  function SLOT_KEY() -> p { p := 0x07 }
  function SLOT_BEFORE() -> p { p := 0x08 }
  function SLOT_AFTER() -> p { p := 0x09 }
  function EVENTS_COUNT() -> p { p := 0x0c }
  function EVENT_ADDRESS() -> p { p := 0x0d }
  function EVENT_TOPIC_COUNT() -> p { p := 0x0e }
  function EVENT_TOPIC0() -> p { p := 0x0f }
  function EVENT_TOPIC1() -> p { p := 0x10 }
  function EVENT_TOPIC2() -> p { p := 0x11 }
  function EVENT_DATA_LENGTH() -> p { p := 0x13 }
  function GAS_PRECHARGE() -> p { p := 0x14 }
  function GAS_PAYER() -> p { p := 0x15 }
`;

/**
 * Compile a Yul assertion. Pass only the *runtime* body; the deploy wrapper is added for you.
 * The body may use everything in YUL_PRELUDE.
 */
export function yul(name: string, runtime: string) {
  const src = `object "${name}" {
    code { datacopy(0, dataoffset("runtime"), datasize("runtime")) return(0, datasize("runtime")) }
    object "runtime" {
      code {
        ${runtime}
        ${YUL_PRELUDE}
      }
    }
  }`;
  return compile("Yul", name, src);
}
