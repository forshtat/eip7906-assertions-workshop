# Facilitator plan (about 2h15)

| Time | Block | Notes |
|------|-------|-------|
| 0:00 | **Intro talk (15 min)** | Blind signing; what the user can't see in a signed tx; the idea of a *post-condition* the chain enforces. Introduce frames (VERIFY / SENDER) and the new POST_TX frame. No code yet. |
| 0:15 | **Setup (10 min)** | Steps 1 and 2. Faucet rate limits are per IP: on shared Wi-Fi have a backup funded key ready. Step 2 sends ~12 txs, so start it early and talk over it. |
| 0:25 | **The attack (10 min)** | Step 3. Pause on the output: *same calldata, same frames*. Ask the room what a wallet could have shown. |
| 0:35 | **First assertion (25 min)** | Step 4. Walk the Yul with the room. Key points: revert = body undone but tx included and paid; the gas pre-charge shows up in the balance diff. |
| 1:00 | **Break (10 min)** | |
| 1:10 | **Events and state (25 min)** | Steps 5 and 6. Step 6 is the aha moment: the event assertion passes while funds are stolen. Ask "what else could a contract do that events don't tell you?" |
| 1:35 | **Composition and attacks (20 min)** | Steps 7 and 8. Tie back to the EIP's Security Considerations: assertions must actually be present, can be griefed through gas, and only cover what they check. |
| 1:55 | **Challenge (20 min)** | Step 9, individually or in pairs. Fast finishers: protect `secret` with a max value, or forbid contract deployments. |
| 2:15 | **Wrap-up** | What's missing: smart accounts enforcing assertions in VERIFY, standard assertion libraries, wallet UX. |

## Things to know before running it live

- The devnet is run by the ethrex team and can be reset. Run all nine steps yourself the day before.
- The devnet implements an earlier spec revision than the current EIP text (see README). Say this out loud.
- If the room's Wi-Fi is bad, `step_*` scripts retry network errors and fail over across the three RPCs.
- Steps 5 to 8 reuse assertions deployed by earlier steps (stored in `.workshop-state.json`), so skipping steps breaks later ones.

## Ideas not covered (candidates for a longer version)

- Smart-account enforcement: a VERIFY frame that requires a specific POST_TX frame to be present (`requireAssertFrame` in the EIP).
- Code and nonce checks (EIP-7702 delegation changes show up as code changes).
- Oracle manipulation: an assertion that reads a price the body can move.
