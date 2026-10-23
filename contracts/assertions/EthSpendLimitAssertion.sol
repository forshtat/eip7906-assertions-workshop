// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../shared/HegotaLibrary.sol";

/// @title EthSpendLimitAssertion
/// @notice Step 4 assertion: reverts if `owner` spent more than `maxSpend` wei of ETH
///         (excluding the upfront EIP-8141 gas pre-charge when `owner` is the gas payer).
contract EthSpendLimitAssertion {
    address public immutable txOracle;

    constructor() {
        (txOracle, ) = HegotaLibrary.deployOracles();
    }

    function assertMaxEthSpend(address owner, uint256 maxSpend) external view {
        uint256 spent = 0;
        uint256 count = HegotaLibrary.query(txOracle, HegotaLibrary.BALANCE_COUNT, 0);

        for (uint256 i = 0; i < count; i++) {
            address account = address(uint160(HegotaLibrary.query(txOracle, HegotaLibrary.BALANCE_ADDRESS, i)));
            if (account == owner) {
                uint256 beforeBal = HegotaLibrary.query(txOracle, HegotaLibrary.BALANCE_BEFORE, i);
                uint256 afterBal = HegotaLibrary.query(txOracle, HegotaLibrary.BALANCE_AFTER, i);
                if (beforeBal > afterBal) {
                    spent = beforeBal - afterBal;
                }
            }
        }

        // The gas pre-charge is not "spending"; subtract it when `owner` is the gas payer.
        address gasPayer = address(uint160(HegotaLibrary.query(txOracle, HegotaLibrary.GAS_PAYER, 0)));
        if (owner == gasPayer) {
            uint256 precharge = HegotaLibrary.query(txOracle, HegotaLibrary.GAS_PRECHARGE, 0);
            spent = spent > precharge ? spent - precharge : 0;
        }

        require(spent <= maxSpend, "EthSpendLimit: exceeded max ETH spend");
    }
}
