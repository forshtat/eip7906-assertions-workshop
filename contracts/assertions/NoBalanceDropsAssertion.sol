// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../shared/HegotaLibrary.sol";

/// @title NoBalanceDropsAssertion
/// @notice Step 6 assertion: inspects storage slot diffs via TXTRACE rather than events.
///         Reverts if `balanceOf[owner]` (at mapping slot 0) decreased in any contract.
contract NoBalanceDropsAssertion {
    address public immutable txOracle;

    constructor() {
        (txOracle, ) = HegotaLibrary.deployOracles();
    }

    function assertNoBalanceDrops(address owner) external view {
        // Slot of `balanceOf[owner]` for any ERC-20 that keeps `balanceOf` at slot 0.
        bytes32 balanceSlot = keccak256(abi.encode(owner, uint256(0)));

        uint256 count = HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_COUNT, 0);
        for (uint256 i = 0; i < count; i++) {
            bytes32 slotKey = bytes32(HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_SLOT, i));
            if (slotKey == balanceSlot) {
                uint256 beforeBal = HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_BEFORE, i);
                uint256 afterBal = HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_AFTER, i);
                require(afterBal >= beforeBal, "NoBalanceDrops: token balance decreased");
            }
        }
    }
}
