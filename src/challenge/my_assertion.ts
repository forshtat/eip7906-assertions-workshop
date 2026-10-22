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
 * Your assertion receives one calldata word: the vault's address (read it with calldataload(0)).
 * Revert (revert(0, 0)) to fail the assertion; just return/stop to pass.
 *
 * TXTRACE helpers you will want (all take an index i; ask for the count first):
 *    txtrace(SLOTS_CHANGED(), 0)   how many (contract, slot) pairs changed
 *    txtrace(SLOT_ADDRESS(), i)    the contract that owns changed slot i
 *    txtrace(SLOT_KEY(), i)        the slot number/key
 *    txtrace(SLOT_BEFORE(), i)     value at the start of the tx
 *    txtrace(SLOT_AFTER(), i)      value right now
 *
 * Yul crib sheet:
 *    let n := txtrace(SLOTS_CHANGED(), 0)
 *    for { let i := 0 } lt(i, n) { i := add(i, 1) } { ... }
 *    if eq(a, b) { revert(0, 0) }
 *
 * Stuck? The answer is in src/solutions/owner_unchanged.ts (try not to peek!).
 */
export const MY_ASSERTION = `
  let vault := calldataload(0)

  // TODO: walk the changed storage slots and revert if the vault's owner slot is one of them.
`;
