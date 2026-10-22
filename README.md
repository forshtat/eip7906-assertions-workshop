# EIP-7906 assertions workshop

Hands-on workshop on **EIP-7906: transaction assertions**. You will watch a blind-signing attack succeed,
then write small on-chain *assertions* that make the same attack roll back, on a real devnet.

Everything runs against the public ethrex **Hegota devnet** (chain 3151908). You don't build a node, install
Foundry, or compile anything by hand: every step is one TypeScript file you can read top to bottom.

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
| 2 | `yarn step_2_setup` | Deploys the playground: a token, an honest dex, two malicious ones |
| 3 | `yarn step_3_blind_signing` | The problem: identical calldata, one dex robs you |
| 4 | `yarn step_4_eth_assertion` | Your first POST_TX assertion: ETH spend limit, balance diffs, the gas pre-charge |
| 5 | `yarn step_5_token_assertion` | Reading events with `TXTRACE` and `EVENTDATACOPY` |
| 6 | `yarn step_6_state_assertion` | Events can lie: asserting on storage diffs instead |
| 7 | `yarn step_7_compose` | Several assertions from different authors in one tx |
| 8 | `yarn step_8_gas_griefing` | Attacking the assertion: padding the log to burn its gas |
| 9 | `yarn step_9_challenge` | **Your turn.** Edit `src/challenge/my_assertion.ts` (`step_9_solution` shows an answer) |

## The 60-second idea

A *frame transaction* is a list of frames. EIP-7906 adds one more kind, **POST_TX**:

- it sits at the end of the list and runs after everything else, read-only;
- it can inspect what the transaction just did (balance, storage and event diffs) via the new `TXTRACE`
  opcode, and copy event data with `EVENTDATACOPY`;
- if it reverts, the transaction's *body* is rolled back. The tx is still included, still paid for.

So a wallet or dapp can attach a check like "I must not lose more than 0.01 ETH" that the chain itself enforces.

## Which version of the spec is this?

The devnet runs ethrex's `hegota-devnet` branch, which implements an earlier revision of the EIP than the
current text. The workshop follows **what the devnet does**:

| | Devnet (this workshop) | Current EIP draft |
|---|---|---|
| Frame mode | `POST_TX` = 3 | renamed `ASSERT` |
| Opcodes | `TXTRACE` 0xB6, `EVENTDATACOPY` 0xB7 | byte values aren't assigned by the EIP; ethrex picks these |
| `TXDIFF` (0xB8) | exists, **deliberately unused here** | removed from the spec |

If the devnet is upgraded, the param numbers in `src/lib/compile.ts` (`YUL_PRELUDE`) are the only place to update.

## Checking your checkout

`yarn verify` typechecks and runs an offline wiring check (compiles every contract and assertion, tests the
frame-transaction codec). It never touches the devnet. CI runs it on every push.

## How the code is organised

```
src/steps/       one file per step: the story, the assertion (Yul), the transactions
src/challenge/   step 9 stub (yours to edit)        src/solutions/  step 9 answer
src/lib/
  frameTx.ts     EIP-8141 encoding + signing; selfVerify() / senderCall() / postTx() builders
  compile.ts     in-process solc: Solidity for dapps, Yul for assertions (+ TXTRACE param names)
  contracts.ts   the demo world (token, dexes, vault), read once and forget
  chain.ts rpc.ts scenario.ts output.ts state.ts config.ts   plumbing
```

Assertions are written in **Yul** because Solidity can't emit the new opcodes. `txtrace(param, index)` and
`eventdatacopy(...)` are provided as Yul functions. Edit an assertion and re-run its step: it is redeployed
automatically because its bytecode changed.

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
