// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// A building block for assertions, written for the EIP-8141 solc fork instead of @forshtat/hegota-support.
//
// https://github.com/chiranjeev13/solidity (release v0.8.38-eip8141.0) teaches inline assembly the EIP-8141
// opcodes as Yul builtins: `approve`, `txparam`, `framedataload`, `framedatacopy`, `frameparam`, `sigparam`,
// `sigdatacopy`. They are enabled by the EVM version `cancun+eip8141`; vanilla solc rejects this file.
// The builtins take their operands top of the stack first, the order of the EIP's stack tables.
//
// The fork does NOT have the EIP-7906 opcodes: TXTRACE (0xB6) and EVENTDATACOPY (0xB7) are not Yul builtins there.
// So this file only uses EIP-8141 opcodes, and the assertions in contracts/assertions/ keep using HegotaSupport,
// which is where `txtrace()` and `eventdatacopy()` come from.
//
// This file lives outside the contracts that src/lib/compile.ts compiles (solc-js cannot take a fork).
// Build it with `yarn compile_fork <path to the fork's solc>`.
contract ForkSolcPostTxGuard {
    // The ids and mode below are the numbers of the EIP-8141 tables (the names in @forshtat/hegota-support's Params.sol).
    uint256 private constant TXPARAM_CURRENT_FRAME_INDEX = 10;
    uint256 private constant FRAMEPARAM_MODE = 2;
    uint256 private constant FRAME_MODE_POST_TX = 3;

    // Reverts unless the caller chain is running inside the transaction's POST_TX frame: an assertion that reads
    // TXTRACE only has data there, so it can refuse to be called from a DEFAULT or SENDER frame.
    function requirePostTxFrame() external view {
        uint256 mode;
        assembly ("memory-safe") {
            mode := frameparam(txparam(TXPARAM_CURRENT_FRAME_INDEX), FRAMEPARAM_MODE)
        }
        require(mode == FRAME_MODE_POST_TX, "not in a POST_TX frame");
    }

    // The mode (DEFAULT 0, VERIFY 1, SENDER 2, POST_TX 3) of the frame that is running.
    function currentFrameMode() external view returns (uint256 mode) {
        assembly ("memory-safe") {
            mode := frameparam(txparam(TXPARAM_CURRENT_FRAME_INDEX), FRAMEPARAM_MODE)
        }
    }
}
