# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other coding agents when working with code in this repository.

## Project Overview

Hands-on workshop for **EIP-7906 (Transaction Assertions)** and **EIP-8141 (Frame Transactions)** targeting the public ethrex **Hegotá devnet** (chain ID `3151908`, branch `lambdaclass/ethrex` `hegota-devnet`).

## Non-Negotiable Codebase Rules

1. **All Solidity code lives in `.sol` files under `contracts/`**:
   - Never embed inline Solidity strings or inline Yul strings in TypeScript files.
   - Demo contracts, DeFi protocols, transaction assertions, the participant challenge stub, and the reference solution must all be real `.sol` files under `contracts/`.
2. **All custom opcodes are encapsulated in `contracts/shared/HegotaLibrary.sol`**:
   - Standard `solc` does not emit the Hegotá devnet opcodes (`TXTRACE`, `EVENTDATACOPY`, `TXPARAM`, `FRAMEDATALOAD`, `FRAMEPARAM`).
   - `HegotaLibrary` deploys tiny stateless bytecode oracle contracts (`deployOracles()`, `deployFrameOracle()`) in the consumer contract's constructor and queries them via `staticcall` (`query()`, `getEventData()`, `txParam()`, `frameDataLoad()`, `frameParam()`).
   - Assertions and protocol contracts import `HegotaLibrary.sol` and are written in standard Solidity.

## Commands

- **Offline verification (typecheck + compile all `.sol` files + verify `HegotaLibrary` oracle bytecodes + test FrameTx codec)**:
  ```bash
  yarn verify
  ```
- **Typecheck only**:
  ```bash
  yarn typecheck
  ```
- **Workshop steps (run against the live Hegotá devnet in order)**:
  ```bash
  yarn step_1_check            # Key generation (.env), faucet claim, dry-run EIP-8141 frame tx
  yarn step_2_setup            # Deploy Playground.sol contracts and seed initial balances/approvals
  yarn step_3_blind_signing    # Demonstrate blind-signing attack on EvilDex vs HonestDex
  yarn step_4_eth_assertion    # EthSpendLimitAssertion.sol (balance diffs + gas pre-charge)
  yarn step_5_token_assertion  # TokenReceiveOnlyAssertion.sol (EVENT_COUNT + EVENTDATACOPY)
  yarn step_6_state_assertion  # NoBalanceDropsAssertion.sol (storage slot diffs vs silent tokens)
  yarn step_7_compose          # Compose multiple POST_TX assertion frames in a single FrameTx
  yarn step_8_gas_griefing     # Demonstrate assertion gas griefing via log spamming
  yarn step_9_circuit_breaker  # LendingPool.sol self-enforced circuit breaker (EIP-8141 + EIP-7906)
  yarn step_10_challenge       # Test participant's contracts/challenge/MyVaultAssertion.sol
  yarn step_10_solution        # Run contracts/solutions/OwnerUnchangedAssertion.sol
  ```

## Architecture

### `contracts/`
- `contracts/shared/HegotaLibrary.sol` — Solidity wrapper library for Hegotá custom opcodes:
  - **EIP-7906** (`POST_TX` frame and its call subtree only): `TXTRACE` (`0xB6`) and `EVENTDATACOPY` (`0xB7`).
  - **EIP-8141** (any frame in a FrameTx): `TXPARAM` (`0xB0`), `FRAMEDATALOAD` (`0xB1`), and `FRAMEPARAM` (`0xB3`).
- `contracts/Playground.sol` — Demo world contracts (`Token`, `HonestDex`, `EvilDex`, `Spammer`, `Vault`).
- `contracts/LendingPool.sol` — Step 9 DeFi pool with an on-chain circuit breaker (`withAssertion` modifier using EIP-8141 frame introspection + `postTransactionAssertion()` checking solvency and scanning `TXTRACE` events for unauthorized token approvals).
- `contracts/assertions/` — Standalone assertion contracts (`EthSpendLimitAssertion.sol`, `TokenReceiveOnlyAssertion.sol`, `NoBalanceDropsAssertion.sol`).
- `contracts/challenge/MyVaultAssertion.sol` & `contracts/solutions/OwnerUnchangedAssertion.sol` — Step 10 challenge stub and solution.

### `src/`
- `src/lib/compile.ts` — In-process `solc` compiler (`compileSol(relPath, contractName)`) that reads from `contracts/` and resolves relative Solidity imports.
- `src/lib/contracts.ts` — Pre-compiled contract artifacts (`{ abi, bytecode }`) exported for use in step scripts.
- `src/lib/frameTx.ts` — EIP-8141 Frame Transaction (`0x06`) RLP encoder, canonical `sigHash`, secp256k1 signer, and frame builders (`selfVerify()`, `senderCall()`, `postTx()`).
- `src/lib/chain.ts` — RPC helpers, `ethrex_simulateFrameTransaction` dry-run, multi-RPC broadcast/receipt polling, and `deployOnce()` (caches deployments in `.workshop-state.json` keyed by `keccak256(bytecode ++ args)` so editing a `.sol` file automatically triggers redeployment).
- `src/steps/step_1_check.ts` .. `src/steps/step_10_challenge.ts` — Self-contained step scripts.
- `src/verify.ts` — Offline CI verification suite (never touches the network).

## Hegotá Devnet Specifics

- **Frame modes**: `DEFAULT = 0`, `VERIFY = 1`, `SENDER = 2`, `POST_TX = 3`.
- **State-growth gas (`stateGas`)**: Every frame carries `[execution_gas, state_gas]`. Any frame that creates new storage slots or accounts must have a non-zero `stateGas` budget (5th parameter of `senderCall`), otherwise it halts with all gas consumed and `stateGasUsed: 0`. `POST_TX` frames are read-only (`STATICCALL`) and always use `stateGas: 0n`.
- **Opcode stack order (ethrex `hegota-devnet`)**:
  - `TXPARAM` (`0xB0`): `[param]` -> `value`
  - `FRAMEDATALOAD` (`0xB1`): `[offset (top), frameIndex]` -> `32-byte word`
  - `FRAMEPARAM` (`0xB3`): `[frameIndex (top), param]` -> `value`
  - `TXTRACE` (`0xB6`): `[index (top), param]` -> `value`
  - `EVENTDATACOPY` (`0xB7`): `[eventIndex (top), memOffset, dataOffset, length]`
