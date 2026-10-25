/**
 * Frame transactions for the ethrex Hegota devnet. The encoding, signing and hashing come from `@forshtat/hegota-support`; this
 * file keeps what is specific to the workshop: the frame vocabulary used in every step, and its gas numbers.
 */
import { profile } from "@forshtat/hegota-support/profiles/ethrex-hegota-devnet";
import * as lib from "@forshtat/hegota-support/tx";
import type { Address, Hex } from "viem";

export type { Frame, FrameTx } from "@forshtat/hegota-support/tx";
import type { Frame, FrameTx } from "@forshtat/hegota-support/tx";

export const encodeTx = (tx: FrameTx): Hex => lib.encodeTx(profile, tx);
export const sigHash = (tx: FrameTx): Hex => lib.sigHash(profile, tx);
export const txHash = (tx: FrameTx): Hex => lib.txHash(profile, tx);
export const signTx = (tx: FrameTx, privateKey: Hex): Promise<FrameTx> => lib.signTx(profile, tx, privateKey);

/** The frame modes of this devnet by name: `DEFAULT`, `VERIFY`, `SENDER`, `POST_TX`. */
export const MODE = profile.frameModes;

/** A transaction by `sender` with one secp256k1 signature entry, which `signTx` fills in. */
export const newTx = (a: { chainId: bigint; nonce: bigint; sender: Address; frames: Frame[]; maxPriorityFeePerGas: bigint; maxFeePerGas: bigint }): FrameTx =>
  lib.newTx({
    chainId: a.chainId,
    sender: a.sender,
    nonceSeq: a.nonce,
    frames: a.frames,
    signatures: [lib.secp256k1Placeholder(profile)],
    fees: { maxPriorityFeePerGas: a.maxPriorityFeePerGas, maxFeePerGas: a.maxFeePerGas },
  });

// ---------------------------------------------------------------------------------------------
// Frame builders: the vocabulary used in every step
// ---------------------------------------------------------------------------------------------

/** "Verify with the sender's own signature, and let it pay for gas and execute." Plain EOAs use the default code. */
export const selfVerify = (): Frame => lib.frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: 30_000n });

/** Call `target` as the sender. This is the transaction "body". */
export const senderCall = (target: Address, data: Hex = "0x", value = 0n, gas = 200_000n, stateGas = 0n): Frame =>
  lib.frame(profile, "SENDER", { target, data, value, execution: gas, state: stateGas });

/** EIP-7906: a read-only assertion that runs after the body. If it reverts, the body is rolled back. */
export const postTx = (target: Address, data: Hex = "0x", gas = 300_000n): Frame =>
  lib.frame(profile, "POST_TX", { target, data, execution: gas });
