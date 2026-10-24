/**
 * In-process compilers (solc-js), so there is no toolchain to install.
 *  - `solidity()` for ordinary contracts (tokens, dapps)
 *  - `compileAssertion()` for assertions: Solidity contracts that inherit HegotaSupport, which gives them the EIP-7906
 *    opcodes (`txtrace`, `eventdatacopy`) as functions.
 */
import { compileSolidity } from "hegota-frames/solidity";

export const solidity = (name: string, source: string) => compileSolidity(name, source, { optimizer: true });

/**
 * Compile an assertion. Pass only the *body*: it becomes the `fallback()` of a contract, so it runs when the POST_TX
 * frame calls it, with the frame's data in `msg.data`. It can use `txtrace`, `eventdatacopy` and every name in
 * `TxTrace` (`TxTrace.BALANCE_AFTER`, ...). Revert to fail the assertion; just return to pass.
 */
export function compileAssertion(name: string, body: string) {
  return solidity(
    name,
    `// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import {HegotaSupport} from "hegota-frames/contracts/HegotaSupport.sol";
import {Devnet} from "hegota-frames/contracts/Devnet.sol";
import {TxTrace} from "hegota-frames/contracts/Params.sol";

contract ${name} is HegotaSupport(Devnet.EIP7906_WORKSHOP) {
  fallback() external {
${body}
  }
}
`,
  );
}
