// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {HegotaSupport} from "hegota-frames/contracts/HegotaSupport.sol";
import {Devnet} from "hegota-frames/contracts/Devnet.sol";

// The names workshop contracts use, so a contract imports everything from here.
import {Scope, TxParam, FrameParam, FrameMode, SigParam, TxTrace} from "hegota-frames/contracts/Params.sol";

/// @title Hegota
/// @notice Gives a contract the Hegotá opcodes of this workshop's devnet as functions: `txtrace`, `eventdatacopy`,
///         `txparam`, `frameparam`, `framedataload`, ... (see hegota-frames' HegotaSupport). The devnet is chosen
///         here once, for every contract of the workshop.
abstract contract Hegota is HegotaSupport(Devnet.EIP7906_WORKSHOP) {}
