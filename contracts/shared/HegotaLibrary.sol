// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title HegotaLibrary
/// @notice Solidity wrappers for the Hegotá devnet's custom opcodes:
///         - EIP-7906: TXTRACE (0xB6) and EVENTDATACOPY (0xB7)
///         - EIP-8141: TXPARAM (0xB0), FRAMEDATALOAD (0xB1), and FRAMEPARAM (0xB3)
/// @dev Standard `solc` does not emit these opcodes and only allows `verbatim` in standalone
///      Yul, not inside Solidity inline `assembly`. Each family is therefore exposed through a
///      tiny stateless oracle contract deployed once in the consumer's constructor and queried
///      via `staticcall`.
library HegotaLibrary {
    // ─────────────────────────────────────────────────────────────────────────
    // Oracle initcodes (12-byte CODECOPY/RETURN deploy prelude + minimal runtime)
    // ─────────────────────────────────────────────────────────────────────────

    // Runtime (15 bytes): calldataload(0) [param], calldataload(32) [index on top], 0xB6 (TXTRACE),
    // mstore(0, result), return(0, 32).
    bytes private constant TXTRACE_INITCODE =
        hex"600f600c600039600f6000f3600035602035b660005260206000f3";

    // Runtime (18 bytes): calldataload(64) [length], calldataload(32) [dataOffset], 0 [memOffset],
    // calldataload(0) [eventIndex on top], 0xB7 (EVENTDATACOPY), return(0, calldataload(64)).
    bytes private constant EVENTDATA_INITCODE =
        hex"6012600c60003960126000f36040356020356000600035b76040356000f3";

    // Runtime (39 bytes, compiled from Yul): dispatches on calldataload(0):
    //   0 => TXPARAM(calldataload(32))
    //   1 => FRAMEDATALOAD(offset = calldataload(64) [top], frameIndex = calldataload(32))
    //   3 => FRAMEPARAM(frameIndex = calldataload(64) [top], param = calldataload(32))
    bytes private constant FRAME_INITCODE =
        hex"602780600a5f395ff3fe6020356040355f358015602057600114601b57b35b5f5260205ff35bb16014565b5050b0601456";

    // ─────────────────────────────────────────────────────────────────────────
    // EIP-7906 TXTRACE parameter selectors
    // ─────────────────────────────────────────────────────────────────────────

    uint256 internal constant BALANCE_COUNT   = 0x00;
    uint256 internal constant STORAGE_COUNT   = 0x01;
    uint256 internal constant CONTRACT_COUNT  = 0x02;
    uint256 internal constant BALANCE_ADDRESS = 0x03;
    uint256 internal constant BALANCE_BEFORE  = 0x04;
    uint256 internal constant BALANCE_AFTER   = 0x05;
    uint256 internal constant STORAGE_ADDRESS = 0x06;
    uint256 internal constant STORAGE_SLOT    = 0x07;
    uint256 internal constant STORAGE_BEFORE  = 0x08;
    uint256 internal constant STORAGE_AFTER   = 0x09;
    uint256 internal constant CONTRACT_ADDR   = 0x0A;
    uint256 internal constant CONTRACT_HASH   = 0x0B;
    uint256 internal constant EVENT_COUNT     = 0x0C;
    uint256 internal constant EVENT_ADDRESS   = 0x0D;
    uint256 internal constant EVENT_TOPIC_CNT = 0x0E;
    uint256 internal constant EVENT_TOPIC0    = 0x0F;
    uint256 internal constant EVENT_TOPIC1    = 0x10;
    uint256 internal constant EVENT_TOPIC2    = 0x11;
    uint256 internal constant EVENT_TOPIC3    = 0x12;
    uint256 internal constant EVENT_DATA_LEN  = 0x13;
    uint256 internal constant GAS_PRECHARGE   = 0x14;
    uint256 internal constant GAS_PAYER       = 0x15;

    // ─────────────────────────────────────────────────────────────────────────
    // EIP-8141 TXPARAM / FRAMEPARAM selectors and frame modes
    // ─────────────────────────────────────────────────────────────────────────

    uint256 internal constant TX_FRAME_COUNT   = 0x09;
    uint256 internal constant TX_CURRENT_FRAME = 0x0A;

    uint256 internal constant FRAME_TARGET     = 0x00;
    uint256 internal constant FRAME_GAS_LIMIT  = 0x01;
    uint256 internal constant FRAME_MODE       = 0x02;
    uint256 internal constant FRAME_FLAGS      = 0x03;
    uint256 internal constant FRAME_DATA_LEN   = 0x04;

    uint256 internal constant MODE_DEFAULT     = 0x00;
    uint256 internal constant MODE_VERIFY      = 0x01;
    uint256 internal constant MODE_SENDER      = 0x02;
    uint256 internal constant MODE_POST_TX     = 0x03;

    // ─────────────────────────────────────────────────────────────────────────
    // Oracle deployment helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deploys the EIP-7906 TXTRACE and EVENTDATACOPY oracle contracts.
    function deployOracles() internal returns (address txOracle, address edOracle) {
        bytes memory txIC = TXTRACE_INITCODE;
        bytes memory edIC = EVENTDATA_INITCODE;
        assembly {
            txOracle := create(0, add(txIC, 0x20), mload(txIC))
            edOracle := create(0, add(edIC, 0x20), mload(edIC))
        }
        require(txOracle != address(0), "TXTRACE oracle deploy failed");
        require(edOracle != address(0), "EventData oracle deploy failed");
    }

    /// @notice Deploys the EIP-8141 TXPARAM / FRAMEDATALOAD / FRAMEPARAM oracle contract.
    function deployFrameOracle() internal returns (address frameOracle) {
        bytes memory ic = FRAME_INITCODE;
        assembly {
            frameOracle := create(0, add(ic, 0x20), mload(ic))
        }
        require(frameOracle != address(0), "Frame oracle deploy failed");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EIP-7906 query helpers (only valid inside a POST_TX frame's call subtree)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Calls `TXTRACE(param, index)` via `oracle`. Uses scratch space to avoid
    ///         heap allocations inside tight event/storage loops.
    function query(
        address oracle,
        uint256 param,
        uint256 index
    ) internal view returns (uint256 result) {
        bool ok;
        assembly {
            mstore(0x00, param)
            mstore(0x20, index)
            ok := staticcall(gas(), oracle, 0x00, 0x40, 0x00, 0x20)
            result := mload(0x00)
        }
        require(ok, "HegotaLibrary: TXTRACE query oracle failed");
    }

    /// @notice Copies `length` bytes of event `eventIndex`'s non-indexed data, starting at
    ///         `dataOffset`, via the EVENTDATACOPY `oracle`.
    function getEventData(
        address oracle,
        uint256 eventIndex,
        uint256 dataOffset,
        uint256 length
    ) internal view returns (bytes memory data) {
        (bool ok, bytes memory raw) = oracle.staticcall(
            abi.encode(eventIndex, dataOffset, length)
        );
        require(ok, "HegotaLibrary: EventData oracle failed");
        data = raw;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EIP-8141 frame-introspection helpers (valid in any frame of a FrameTx)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Calls `TXPARAM(param)` (0xB0) via `frameOracle`.
    function txParam(address frameOracle, uint256 param) internal view returns (uint256 result) {
        return _callFrameOracle(frameOracle, 0, param, 0);
    }

    /// @notice Calls `FRAMEDATALOAD(offset, frameIndex)` (0xB1) via `frameOracle`.
    function frameDataLoad(
        address frameOracle,
        uint256 frameIndex,
        uint256 offset
    ) internal view returns (bytes32 word) {
        return bytes32(_callFrameOracle(frameOracle, 1, frameIndex, offset));
    }

    /// @notice Calls `FRAMEPARAM(param, frameIndex)` (0xB3) via `frameOracle`.
    function frameParam(
        address frameOracle,
        uint256 param,
        uint256 frameIndex
    ) internal view returns (uint256 result) {
        return _callFrameOracle(frameOracle, 3, param, frameIndex);
    }

    function _callFrameOracle(
        address frameOracle,
        uint256 op,
        uint256 a,
        uint256 b
    ) private view returns (uint256 result) {
        bool ok;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, op)
            mstore(add(ptr, 0x20), a)
            mstore(add(ptr, 0x40), b)
            ok := staticcall(gas(), frameOracle, ptr, 0x60, 0x00, 0x20)
            result := mload(0x00)
        }
        require(ok, "HegotaLibrary: frame oracle call failed");
    }
}
