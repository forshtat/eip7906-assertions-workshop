/**
 * EIP-8141 frame transactions (type 0x06), as encoded by the ethrex Hegota devnet.
 *
 *   raw      = 0x06 || rlp(envelope)
 *   envelope = [chain_id, nonce_keys, nonce_seq, sender, frames, signatures,
 *               max_priority_fee, max_fee, max_blob_fee, blob_hashes, recent_root_references]
 *   frame    = [mode, flags, target_or_empty, [execution_gas, state_gas], value, data]
 *   sig      = [scheme, signer, msg, signature_bytes]
 */
import { concat, keccak256, numberToHex, toHex, toRlp, type Address, type Hex } from "viem";
import { sign } from "viem/accounts";

export const FRAME_TX_TYPE = "0x06";

export const MODE = {
  DEFAULT: 0, //  caller is ENTRY_POINT
  VERIFY: 1, //   validates the transaction, can APPROVE gas payment / execution
  SENDER: 2, //   runs as tx.sender (the only mode that can carry value)
  POST_TX: 3, //  EIP-7906: read-only assertion, trailing suffix of the frame list
} as const;

/** Bits 0-1 of `flags` on a VERIFY frame: what the APPROVE opcode grants. */
export const APPROVE = { NONE: 0, PAYMENT: 1, EXECUTION: 2, BOTH: 3 } as const;

export interface Frame {
  mode: number;
  flags: number;
  target: Address | null;
  /** execution gas */
  gas: bigint;
  /** state-growth gas (new accounts / new storage slots). 0 halts any frame that creates state. */
  stateGas: bigint;
  value: bigint;
  data: Hex;
}

export interface FrameTx {
  chainId: bigint;
  nonce: bigint;
  sender: Address;
  frames: Frame[];
  /** for the common case of one secp256k1 signature by the sender */
  signature: Hex;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
}

// ---------------------------------------------------------------------------------------------
// Frame builders: the vocabulary used in every step
// ---------------------------------------------------------------------------------------------

/** "Verify with the sender's own signature, and let it pay for gas and execute." Plain EOAs use the default code. */
export const selfVerify = (): Frame =>
  ({ mode: MODE.VERIFY, flags: APPROVE.BOTH, target: null, gas: 30_000n, stateGas: 0n, value: 0n, data: "0x" });

/** Call `target` as the sender. This is the transaction "body". */
export const senderCall = (target: Address, data: Hex = "0x", value = 0n, gas = 200_000n, stateGas = 0n): Frame =>
  ({ mode: MODE.SENDER, flags: 0, target, gas, stateGas, value, data });

/** EIP-7906: a read-only assertion that runs after the body. If it reverts, the body is rolled back. */
export const postTx = (target: Address, data: Hex = "0x", gas = 300_000n): Frame =>
  ({ mode: MODE.POST_TX, flags: 0, target, gas, stateGas: 0n, value: 0n, data });

// ---------------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------------

/** RLP integer: zero is the empty string, otherwise minimal big-endian bytes. */
const int = (n: bigint | number): Hex => {
  const b = BigInt(n);
  if (b === 0n) return "0x";
  const h = numberToHex(b);
  return h.length % 2 ? (`0x0${h.slice(2)}` as Hex) : h;
};

const encodeFrame = (f: Frame) => [int(f.mode), int(f.flags), f.target ?? "0x", [int(f.gas), int(f.stateGas)], int(f.value), f.data];

const SECP256K1 = 1;

function envelope(tx: FrameTx, signatureBytes: Hex) {
  // msg is empty => the signature covers the canonical sig_hash
  const sig = [int(SECP256K1), tx.sender, "0x", signatureBytes];
  return [
    int(tx.chainId),
    [int(0)], // nonce_keys: key 0 = the account's normal nonce
    int(tx.nonce),
    tx.sender,
    tx.frames.map(encodeFrame),
    [sig],
    int(tx.maxPriorityFeePerGas),
    int(tx.maxFeePerGas),
    int(0), // max_fee_per_blob_gas
    [], // blob_versioned_hashes
    [], // recent_root_references (EIP-8272)
  ];
}

export const encodeTx = (tx: FrameTx): Hex => concat([FRAME_TX_TYPE, toRlp(envelope(tx, tx.signature) as any)]);

/** keccak(0x06 || rlp(envelope with the signature bytes elided)) */
export const sigHash = (tx: FrameTx): Hex => keccak256(concat([FRAME_TX_TYPE, toRlp(envelope(tx, "0x") as any)]));

/** Sign with secp256k1 as `v || r || s`, where v is a bare recovery id (0 or 1) and s is low. */
export async function signTx(tx: FrameTx, privateKey: Hex): Promise<FrameTx> {
  const { r, s, yParity } = await sign({ hash: sigHash({ ...tx, signature: "0x" }), privateKey });
  return { ...tx, signature: concat([toHex(yParity ?? 0, { size: 1 }), r, s]) };
}

export const txHash = (tx: FrameTx): Hex => keccak256(encodeTx(tx));
