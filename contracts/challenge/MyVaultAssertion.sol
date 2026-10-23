// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../shared/HegotaLibrary.sol";

/**
 * YOUR TURN — write the assertion for step 10, then run:   yarn step_10_challenge
 *
 * The scenario: you own a Vault (see contracts/Playground.sol). Its storage looks like this:
 *
 *    slot 0   owner     (address)
 *    slot 1   secret    (uint256)
 *
 * A dapp asks you to sign a transaction that "updates your vault's secret". Your job is to write an
 * assertion that lets `setSecret(42)` through but blocks anything that changes who OWNS the vault.
 *
 * HegotaLibrary helpers you will want (see contracts/shared/HegotaLibrary.sol):
 *    HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_COUNT, 0)    how many (contract, slot) pairs changed
 *    HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_ADDRESS, i)  the contract that owns changed slot i
 *    HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_SLOT, i)     the slot number/key
 *    HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_BEFORE, i)   value at the start of the tx
 *    HegotaLibrary.query(txOracle, HegotaLibrary.STORAGE_AFTER, i)    value right now
 *
 * Stuck? The answer is in contracts/solutions/OwnerUnchangedAssertion.sol (try not to peek!).
 */
contract MyVaultAssertion {
    address public immutable txOracle;

    constructor() {
        (txOracle, ) = HegotaLibrary.deployOracles();
    }

    function assertOwnerUnchanged(address vault) external view {
        // TODO: walk the changed storage slots and revert if `vault`'s owner slot (slot 0) is one of them.
        vault;
    }
}
