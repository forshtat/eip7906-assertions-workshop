// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {HegotaSupport, Devnet, TxTrace} from "hegota-frames/contracts/HegotaSupport.sol";

/// @title EthSpendLimitAssertion
/// @notice Step 4 assertion: reverts if `owner` spent more than `maxSpend` wei of ETH
///         (excluding the upfront EIP-8141 gas pre-charge when `owner` is the gas payer).
contract EthSpendLimitAssertion is HegotaSupport(Devnet.EIP7906_WORKSHOP) {
    function assertMaxEthSpend(address owner, uint256 maxSpend) external view {
        uint256 spent = 0;
        uint256 count = txtrace(0, TxTrace.BALANCES_CHANGED);

        for (uint256 i = 0; i < count; i++) {
            address account = address(uint160(txtrace(i, TxTrace.BALANCE_ADDRESS)));
            if (account == owner) {
                uint256 beforeBal = txtrace(i, TxTrace.BALANCE_BEFORE);
                uint256 afterBal = txtrace(i, TxTrace.BALANCE_AFTER);
                if (beforeBal > afterBal) {
                    spent = beforeBal - afterBal;
                }
            }
        }

        // The gas pre-charge is not "spending"; subtract it when `owner` is the gas payer.
        address gasPayer = address(uint160(txtrace(0, TxTrace.GAS_PAYER)));
        if (owner == gasPayer) {
            uint256 precharge = txtrace(0, TxTrace.GAS_PRECHARGE);
            spent = spent > precharge ? spent - precharge : 0;
        }

        require(spent <= maxSpend, "EthSpendLimit: exceeded max ETH spend");
    }
}
