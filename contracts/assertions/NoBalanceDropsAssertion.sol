// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Hegota, TxTrace} from "../shared/Hegota.sol";

/// @title NoBalanceDropsAssertion
/// @notice Step 6 assertion: inspects storage slot diffs via TXTRACE rather than events.
///         Reverts if `balanceOf[owner]` (at mapping slot 0) decreased in any contract.
contract NoBalanceDropsAssertion is Hegota {
    function assertNoBalanceDrops(address owner) external view {
        // Slot of `balanceOf[owner]` for any ERC-20 that keeps `balanceOf` at slot 0.
        bytes32 balanceSlot = keccak256(abi.encode(owner, uint256(0)));

        uint256 count = txtrace(0, TxTrace.SLOTS_CHANGED);
        for (uint256 i = 0; i < count; i++) {
            bytes32 slotKey = bytes32(txtrace(i, TxTrace.SLOT_KEY));
            if (slotKey == balanceSlot) {
                uint256 beforeBal = txtrace(i, TxTrace.SLOT_BEFORE);
                uint256 afterBal = txtrace(i, TxTrace.SLOT_AFTER);
                require(afterBal >= beforeBal, "NoBalanceDrops: token balance decreased");
            }
        }
    }
}
