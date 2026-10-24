# EIP-7906 assertions workshop

Hands-on workshop on **EIP-7906: transaction assertions**. You will watch a blind-signing attack succeed,
then write small on-chain *assertions* in Solidity that make the same attack roll back, on a real devnet.

Everything runs against the public ethrex **Hegota devnet** (chain 3151908). You don't build a node, install
Foundry, or compile anything by hand: all Solidity contracts in `contracts/` are compiled in-process by `solc`.

## Quick start

Needs Node.js ≥ 20.12 and [Yarn 1](https://classic.yarnpkg.com) (`corepack enable`, or `npm i -g yarn`).

```bash
yarn install
yarn step_1_check
```

Then run the steps in order. Each one ends by telling you the next command.

| # | Command | You learn |
|---|---------|-----------|
| 1 | `yarn step_1_check` | Key + faucet + what a frame transaction (EIP-8141) looks like |
| 2 | `yarn step_2_setup` | Deploys the playground (`contracts/Playground.sol`): a token, an honest dex, two malicious ones |
| 3 | `yarn step_3_blind_signing` | The problem: identical calldata, one dex robs you |
| 4 | `yarn step_4_eth_assertion` | Your first POST_TX assertion (`contracts/assertions/EthSpendLimitAssertion.sol`): ETH spend limit, balance diffs, the gas pre-charge |
| 5 | `yarn step_5_token_assertion` | Reading events with `TXTRACE` and `EVENTDATACOPY` (`contracts/assertions/TokenReceiveOnlyAssertion.sol`) |
| 6 | `yarn step_6_state_assertion` | Events can lie: asserting on storage diffs instead (`contracts/assertions/NoBalanceDropsAssertion.sol`) |
| 7 | `yarn step_7_compose` | Several assertions from different authors in one tx |
| 8 | `yarn step_8_gas_griefing` | Attacking the assertion: padding the log to burn its gas |
| 9 | `yarn step_9_circuit_breaker` | DeFi protocol circuit breakers (`contracts/LendingPool.sol`): contracts that require and enforce their own POST_TX invariants |
| 10 | `yarn step_10_challenge` | **Your turn.** Edit `contracts/challenge/MyVaultAssertion.sol` (`step_10_solution` runs `contracts/solutions/OwnerUnchangedAssertion.sol`) |

## The 60-second idea

A *frame transaction* is a list of frames. EIP-7906 adds one more kind, **POST_TX**:

- it sits at the end of the list and runs after everything else, read-only;
- it can inspect what the transaction just did (balance, storage and event diffs) via the new `TXTRACE`
  opcode, and copy event data with `EVENTDATACOPY`;
- if it reverts, the transaction's *body* is rolled back. The tx is still included, still paid for.

So a wallet, dapp, or DeFi protocol can attach a check like "I must not lose more than 0.01 ETH" or
"pool reserves must remain solvent" that the chain itself enforces.

## Which version of the spec is this?

The devnet runs ethrex's `hegota-devnet` branch, which implements an earlier revision of the EIP than the
current text. The workshop follows **what the devnet does**:

| | Devnet (this workshop) | Current EIP draft |
|---|---|---|
| Frame mode | `POST_TX` = 3 | renamed `ASSERT` |
| Opcodes | `TXTRACE` 0xB6, `EVENTDATACOPY` 0xB7 | byte values aren't assigned by the EIP; ethrex picks these |
| `TXDIFF` (0xB8) | exists, **deliberately unused here** | removed from the spec |

All custom opcodes (`TXTRACE`, `EVENTDATACOPY`, `TXPARAM`, `FRAMEDATALOAD`, `FRAMEPARAM`, ...) come from
[hegota-frames](https://github.com/forshtat/hegota-frames-yul-library) through `contracts/shared/Hegota.sol`, so every
contract and assertion is written in standard Solidity: `contract MyAssertion is Hegota`, then
`txtrace(i, TxTrace.BALANCE_AFTER)`.

Run the steps in order. Step 1 **resets** the workshop (it deletes `.workshop-state.json`), and every later step refuses
to run until step 2 has deployed the playground, or if the key in `.env` is not the one step 1 recorded: the contracts,
approvals and balances belong to that key.

## Checking your checkout

`yarn verify` typechecks and runs an offline wiring check (compiles every Solidity contract and assertion in
`contracts/`, checks the hegota-frames helpers are embedded, and tests the step order and frame-transaction signing). It never
touches the devnet. CI runs it on every push.

## How the code is organised

```
contracts/
  shared/Hegota.sol                            the Hegotá opcodes as functions (hegota-frames' HegotaSupport) + parameter enums
  Playground.sol                               Token, HonestDex, EvilDex, Spammer, Vault
  LendingPool.sol                              Step 9 DeFi pool with self-enforced circuit breaker
  assertions/EthSpendLimitAssertion.sol        Step 4 assertion
  assertions/TokenReceiveOnlyAssertion.sol     Step 5 assertion
  assertions/NoBalanceDropsAssertion.sol       Step 6 assertion
  challenge/MyVaultAssertion.sol               Step 10 challenge stub (yours to edit)
  solutions/OwnerUnchangedAssertion.sol        Step 10 reference solution
src/
  steps/       one file per step: the story and the frame transactions
  lib/
    frameTx.ts   EIP-8141 encoding + signing; selfVerify() / senderCall() / postTx() builders
    compile.ts   in-process solc compiler for `contracts/*.sol`
    contracts.ts compiled artifacts exported from `contracts/`
    chain.ts rpc.ts scenario.ts output.ts state.ts config.ts   plumbing
```

Edit any `.sol` assertion file and re-run its step: it is recompiled in-process and redeployed automatically
because its bytecode changed.

## Troubleshooting

- **Faucet says rate limited**: it allows one claim per IP. Ask for ETH from a neighbour or the instructor.
- **A transaction doesn't confirm after ~30 s**: gossip between devnet nodes is best-effort. The scripts already
  re-send to the other two RPCs; if you still see a timeout, just run the step again.
- **A frame fails with all its gas used and `stateGasUsed: 0`**: creating accounts / storage slots needs a *state*
  gas budget (last argument of `senderCall`).
- **The devnet was reset**: delete `.workshop-state.json` and start again from step 2.
- **Use another RPC**: put `RPC_URL=https://rpc2.hegota.ethrex.xyz` in `.env`.
- Your key lives in `.env` and is only meant for this devnet. Don't reuse it anywhere.

Resources: [EIP-7906](https://eips.ethereum.org/EIPS/eip-7906) ·
[devnet user guide](https://github.com/lambdaclass/ethrex/blob/hegota-devnet/scripts/hegota-devnet/USER-GUIDE.md) ·
[explorer](https://dora.hegota.ethrex.xyz) · [faucet](https://faucet.hegota.ethrex.xyz)
