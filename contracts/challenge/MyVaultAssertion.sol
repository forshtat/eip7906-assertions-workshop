// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {HegotaSupport, Devnet, TxTrace} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";

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
 * Your contract inherits HegotaSupport (from the hegota-support package), which gives you the EIP-7906 opcodes as functions. The index
 * comes first, then the name of what you want to know (the same order as the TXTRACE opcode's stack):
 *    txtrace(0, TxTrace.SLOTS_CHANGED)    how many (contract, slot) pairs changed
 *    txtrace(i, TxTrace.SLOT_ADDRESS)     the contract that owns changed slot i
 *    txtrace(i, TxTrace.SLOT_KEY)         the slot number/key
 *    txtrace(i, TxTrace.SLOT_BEFORE)      value at the start of the tx
 *    txtrace(i, TxTrace.SLOT_AFTER)       value right now
 *
 * Stuck? The answer is in contracts/solutions/OwnerUnchangedAssertion.sol (try not to peek!).
 */
contract MyVaultAssertion is HegotaSupport(Devnet.EIP7906_WORKSHOP) {
    function assertOwnerUnchanged(address vault) external view {
        // TODO: walk the changed storage slots and revert if `vault`'s owner slot (slot 0) is one of them.
        vault;
    }
}
