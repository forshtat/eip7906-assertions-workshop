// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../shared/HegotaLibrary.sol";

/// @title TokenReceiveOnlyAssertion
/// @notice Step 5 assertion: inspects the transaction's emitted events via TXTRACE and
///         EVENTDATACOPY. Reverts if any ERC-20 token leaves `owner`, or if `owner`
///         receives fewer than `minReceived` of `token`.
contract TokenReceiveOnlyAssertion {
    // System address that emits Transfer-shaped logs for native ETH value transfers.
    address internal constant SYSTEM_ADDRESS = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;

    // keccak256("Transfer(address,address,uint256)")
    bytes32 internal constant TRANSFER_SELECTOR =
        0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

    address public immutable txOracle;
    address public immutable edOracle;

    constructor() {
        (txOracle, edOracle) = HegotaLibrary.deployOracles();
    }

    function assertTokenReceiveOnly(
        address owner,
        address token,
        uint256 minReceived
    ) external view {
        uint256 received = 0;
        uint256 count = HegotaLibrary.query(txOracle, HegotaLibrary.EVENT_COUNT, 0);

        for (uint256 i = 0; i < count; i++) {
            // Transfer(address indexed from, address indexed to, uint256 value) has 3 topics.
            if (HegotaLibrary.query(txOracle, HegotaLibrary.EVENT_TOPIC_CNT, i) != 3) continue;
            if (bytes32(HegotaLibrary.query(txOracle, HegotaLibrary.EVENT_TOPIC0, i)) != TRANSFER_SELECTOR) continue;

            address emitter = address(uint160(HegotaLibrary.query(txOracle, HegotaLibrary.EVENT_ADDRESS, i)));
            if (emitter == SYSTEM_ADDRESS) continue;

            address from = address(uint160(HegotaLibrary.query(txOracle, HegotaLibrary.EVENT_TOPIC1, i)));
            require(from != owner, "TokenReceiveOnly: outgoing token transfer forbidden");

            address to = address(uint160(HegotaLibrary.query(txOracle, HegotaLibrary.EVENT_TOPIC2, i)));
            if (to == owner && emitter == token) {
                bytes memory data = HegotaLibrary.getEventData(edOracle, i, 0, 32);
                received += abi.decode(data, (uint256));
            }
        }

        require(received >= minReceived, "TokenReceiveOnly: insufficient tokens received");
    }
}
