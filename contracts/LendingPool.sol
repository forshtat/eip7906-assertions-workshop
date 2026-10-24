// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Playground.sol";
import {HegotaSupport, Devnet, TxParam, FrameParam, FrameMode, TxTrace} from "hegota-frames/contracts/HegotaSupport.sol";

/// @title LendingPool
/// @notice DeFi pool with an on-chain Circuit Breaker enforced via EIP-8141 and EIP-7906 (Step 9).
///         Every state-changing entry point carries `withAssertion`, which inspects the outer
///         Frame Transaction (via the `HegotaSupport` frame opcodes) to require a `POST_TX` frame calling
///         `this.postTransactionAssertion()`. After the body runs, `postTransactionAssertion()`
///         checks pool solvency and scans `TXTRACE` events for unauthorized token approvals.
contract LendingPool is HegotaSupport(Devnet.EIP7906_WORKSHOP) {
    uint256 public reserves; // slot 0: accounted token reserves
    Token public immutable asset;

    constructor(Token a) {
        asset = a;
    }

    modifier withAssertion() {
        require(containsValidAssertion(), "LendingPool: missing circuit breaker POST_TX frame");
        _;
    }

    function sync() external {
        reserves = asset.balanceOf(address(this));
    }

    function deposit(uint256 amount) external withAssertion {
        asset.transferFrom(msg.sender, address(this), amount);
        reserves += amount;
    }

    /// @notice Bug #1 (reserve drain): meant to sweep only excess tokens above `reserves`,
    ///         but forgets to subtract `reserves` and transfers the raw `amount` out.
    function skim(address to, uint256 amount) external withAssertion {
        asset.transfer(to, amount);
    }

    /// @notice Bug #2 (allowance backdoor): an unguarded helper that lets a caller trick the
    ///         pool into approving its own asset to an attacker without changing balances now.
    function approveRouter(Token t, address spender, uint256 amount) external withAssertion {
        t.approve(spender, amount);
    }

    /// @notice Checks via EIP-8141 frame introspection that the enclosing Frame Transaction
    ///         includes a `POST_TX` frame targeting `this.postTransactionAssertion()`.
    function containsValidAssertion() public view returns (bool) {
        uint256 framesCount = txparam(TxParam.FRAME_COUNT);
        for (uint256 i = 0; i < framesCount; i++) {
            uint256 mode = frameparam(i, FrameParam.MODE);
            if (mode != uint256(FrameMode.POST_TX)) continue;

            address target = address(uint160(frameparam(i, FrameParam.RESOLVED_TARGET)));
            if (target != address(this)) continue;

            uint256 dataLen = frameparam(i, FrameParam.DATA_LENGTH);
            if (dataLen < 4) continue;

            bytes4 selector = bytes4(framedataload(0, i));
            if (selector == this.postTransactionAssertion.selector) {
                return true;
            }
        }
        return false;
    }

    /// @notice Invoked in the `POST_TX` frame after the transaction body completes.
    ///         Reverting here rolls back the entire transaction body.
    function postTransactionAssertion() external view {
        // 1. Solvency invariant: actual token balance must cover accounted reserves.
        require(asset.balanceOf(address(this)) >= reserves, "CircuitBreaker: pool insolvent");

        // 2. Allowance invariant: the pool must never grant a non-zero token approval.
        uint256 eventCount = txtrace(0, TxTrace.EVENTS_COUNT);
        for (uint256 i = 0; i < eventCount; i++) {
            if (txtrace(i, TxTrace.EVENT_TOPIC_COUNT) != 3) continue;
            if (bytes32(txtrace(i, TxTrace.EVENT_TOPIC0)) != Token.Approval.selector) continue;

            address tokenOwner = address(uint160(txtrace(i, TxTrace.EVENT_TOPIC1)));
            if (tokenOwner == address(this)) {
                uint256 allowanceGranted = abi.decode(eventdatacopy(i, 0, 32), (uint256));
                require(allowanceGranted == 0, "CircuitBreaker: unauthorized pool approval");
            }
        }
    }
}
