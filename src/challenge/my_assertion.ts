/**
 * YOUR TURN — write the assertion for step 9, then run:   yarn step_9_challenge
 *
 * The scenario: you own a Vault (see src/lib/contracts.ts). Its storage looks like this:
 *
 *    slot 0   owner     (address)
 *    slot 1   secret    (uint256)
 *
 * A dapp asks you to sign a transaction that "updates your vault's secret". Your job is to write an
 * assertion that lets `setSecret(42)` through but blocks anything that changes who OWNS the vault.
 *
 * Your assertion receives one calldata word: the vault's address. It is the body of a Solidity `fallback()` in a
 * contract that inherits HegotaSupport, so `msg.data` is that word and you can call the EIP-7906 opcodes:
 * revert to fail the assertion; just return to pass.
 *
 * TXTRACE helpers you will want (all take an index i; ask for the count first). Note the order: the index
 * comes first, then the name of what you want to know, the same order as the opcode's stack.
 *
 *    txtrace(0, TxTrace.SLOTS_CHANGED)     how many (contract, slot) pairs changed
 *    txtrace(i, TxTrace.SLOT_ADDRESS)      the contract that owns changed slot i
 *    txtrace(i, TxTrace.SLOT_KEY)          the slot number/key
 *    txtrace(i, TxTrace.SLOT_BEFORE)       value at the start of the tx
 *    txtrace(i, TxTrace.SLOT_AFTER)        value right now
 *
 * Solidity crib sheet:
 *    uint256 n = txtrace(0, TxTrace.SLOTS_CHANGED);
 *    for (uint256 i; i < n; ++i) { ... }
 *    address a = address(uint160(txtrace(i, TxTrace.SLOT_ADDRESS)));
 *    require(a != vault);
 *
 * Stuck? The answer is in src/solutions/owner_unchanged.ts (try not to peek!).
 */
export const MY_ASSERTION = `
    address vault = abi.decode(msg.data, (address));

    // TODO: walk the changed storage slots and revert if the vault's owner slot is one of them.
`;
