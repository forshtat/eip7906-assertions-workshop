// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Hegota, TxTrace} from "../shared/Hegota.sol";

/// @title OwnerUnchangedAssertion
/// @notice Reference solution for the Step 10 challenge: reverts if slot 0 (`owner`)
///         of `vault` was modified during the transaction.
contract OwnerUnchangedAssertion is Hegota {
    function assertOwnerUnchanged(address vault) external view {
        uint256 count = txtrace(0, TxTrace.SLOTS_CHANGED);
        for (uint256 i = 0; i < count; i++) {
            address target = address(uint160(txtrace(i, TxTrace.SLOT_ADDRESS)));
            if (target == vault) {
                uint256 slotKey = txtrace(i, TxTrace.SLOT_KEY);
                require(slotKey != 0, "OwnerUnchanged: vault owner slot modified");
            }
        }
    }
}
