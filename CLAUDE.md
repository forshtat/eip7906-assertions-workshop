# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other coding agents when working with code in this repository.

## Project Overview

Hands-on workshop for **EIP-7906 (Transaction Assertions)** and **EIP-8141 (Frame Transactions)** targeting the public ethrex **Hegotá devnet** (chain ID `3151908`, branch `lambdaclass/ethrex` `hegota-devnet`).

## Non-Negotiable Codebase Rules

1. **All Solidity code lives in `.sol` files under `contracts/`**:
   - Never embed inline Solidity strings or inline Yul strings in TypeScript files.
   - Demo contracts, DeFi protocols, transaction assertions, the participant challenge stub, and the reference solution must all be real `.sol` files under `contracts/`.
2. **All custom opcodes come from the `hegota-frames` package, through `contracts/shared/Hegota.sol`**:
   - Standard `solc` does not emit the Hegotá devnet opcodes (`TXTRACE`, `EVENTDATACOPY`, `TXPARAM`, `FRAMEDATALOAD`, `FRAMEPARAM`, ...).
   - `hegota-frames` (https://github.com/forshtat/hegota-frames-yul-library) provides `HegotaSupport`: its constructor creates one small Yul helper per opcode, and `txtrace()`, `eventdatacopy()`, `txparam()`, `frameparam()`, `framedataload()` ... call them. Parameter ids are enums (`TxTrace.SLOTS_CHANGED`, `TxParam.FRAME_COUNT`, ...).
   - `contracts/shared/Hegota.sol` fixes the workshop's devnet once (`abstract contract Hegota is HegotaSupport(Devnet.EIP7906_WORKSHOP)`). Assertions and protocol contracts write `contract X is Hegota` and are otherwise standard Solidity.
   - Never paste opcode bytes into this repo. A new or changed opcode is a change in hegota-frames.

## Commands

- **Offline verification (typecheck + compile all `.sol` files + check the hegota-frames helpers are embedded + test the step order and FrameTx signing)**:
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
- `contracts/shared/Hegota.sol` — `abstract contract Hegota`: the Hegotá opcodes of this devnet as functions (from hegota-frames' `HegotaSupport`) and the parameter enums:
  - **EIP-7906** (`POST_TX` frame and its call subtree only): `txtrace(index, TxTrace.X)` (`0xB6`) and `eventdatacopy(...)` (`0xB7`).
  - **EIP-8141** (any frame in a FrameTx): `txparam` (`0xB0`), `framedataload` (`0xB1`), `frameparam` (`0xB3`), plus `approve` and `sigparam`.
- `contracts/Playground.sol` — Demo world contracts (`Token`, `HonestDex`, `EvilDex`, `Spammer`, `Vault`).
- `contracts/LendingPool.sol` — Step 9 DeFi pool with an on-chain circuit breaker (`withAssertion` modifier using EIP-8141 frame introspection + `postTransactionAssertion()` checking solvency and scanning `TXTRACE` events for unauthorized token approvals).
- `contracts/assertions/` — Standalone assertion contracts (`EthSpendLimitAssertion.sol`, `TokenReceiveOnlyAssertion.sol`, `NoBalanceDropsAssertion.sol`).
- `contracts/challenge/MyVaultAssertion.sol` & `contracts/solutions/OwnerUnchangedAssertion.sol` — Step 10 challenge stub and solution.

### `src/`
- `src/lib/compile.ts` — In-process `solc` compiler (`compileSol(relPath, contractName)`) that reads from `contracts/`, resolves relative Solidity imports, and resolves `hegota-frames/...` imports to the installed package.
- `src/lib/contracts.ts` — Pre-compiled contract artifacts (`{ abi, bytecode }`) exported for use in step scripts.
- `src/lib/frameTx.ts` — the workshop's frame vocabulary (`selfVerify()`, `senderCall()`, `postTx()`) on top of hegota-frames' transaction codec (encoding, `sigHash`, signing).
- `src/lib/progress.ts` — step order: step 1 resets the workshop, every later step needs step 2 and the key step 1 recorded.
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
