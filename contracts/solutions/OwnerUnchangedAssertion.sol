// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../shared/HegotaLibrary.sol";

/// @title OwnerUnchangedAssertion
/// @notice Reference solution for the Step 10 challenge: reverts if slot 0 (`owner`)
///         of `vault` was modified during the transaction.
contract OwnerUnchangedAssertion {
    address public immutable txOracle;

    constructor() {
        (txOracle, ) = HegotaLibrary.deployOracles();
    }

    function assertOwnerUnchanged(address vault) external view {
        uint256 count = HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_COUNT, 0);
        for (uint256 i = 0; i < count; i++) {
            address target = address(uint160(HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_ADDRESS, i)));
            if (target == vault) {
                uint256 slotKey = HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_SLOT, i);
                require(slotKey != 0, "OwnerUnchanged: vault owner slot modified");
            }
        }
    }
}
