/** One possible answer to the step 9 challenge. */
export const OWNER_UNCHANGED = `
  let vault := calldataload(0)

  let n := txtrace(SLOTS_CHANGED(), 0)
  for { let i := 0 } lt(i, n) { i := add(i, 1) } {
    if eq(txtrace(SLOT_ADDRESS(), i), vault) {
      // slot 0 is the owner; any change to it fails the assertion
      if iszero(txtrace(SLOT_KEY(), i)) { revert(0, 0) }
    }
  }
`;
