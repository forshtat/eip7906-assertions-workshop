/** One possible answer to the step 9 challenge. */
export const OWNER_UNCHANGED = `
    address vault = abi.decode(msg.data, (address));

    uint256 n = txtrace(0, TxTrace.SLOTS_CHANGED);
    for (uint256 i; i < n; ++i) {
      if (address(uint160(txtrace(i, TxTrace.SLOT_ADDRESS))) == vault) {
        // slot 0 is the owner; any change to it fails the assertion
        require(txtrace(i, TxTrace.SLOT_KEY) != 0);
      }
    }
`;
