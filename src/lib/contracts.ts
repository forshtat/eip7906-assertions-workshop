/**
 * Compiled contracts from `contracts/*.sol`:
 *
 *  - Playground (`contracts/Playground.sol`):
 *      Token, HonestDex, EvilDex, Spammer, Vault
 *  - DeFi Circuit Breaker (`contracts/LendingPool.sol`):
 *      LendingPool (is `HegotaSupport`: EIP-8141 frame checks and EIP-7906 post-tx assertions)
 *  - Assertions (`contracts/assertions/*.sol`):
 *      EthSpendLimitAssertion, TokenReceiveOnlyAssertion, NoBalanceDropsAssertion
 */
import { compileSol } from "./compile.js";

export const TokenC = compileSol("Playground.sol", "Token");
export const HonestDexC = compileSol("Playground.sol", "HonestDex");
export const EvilDexC = compileSol("Playground.sol", "EvilDex");
export const SpammerC = compileSol("Playground.sol", "Spammer");
export const VaultC = compileSol("Playground.sol", "Vault");

export const LendingPoolC = compileSol("LendingPool.sol", "LendingPool");

export const EthSpendLimitAssertionC = compileSol("assertions/EthSpendLimitAssertion.sol", "EthSpendLimitAssertion");
export const TokenReceiveOnlyAssertionC = compileSol("assertions/TokenReceiveOnlyAssertion.sol", "TokenReceiveOnlyAssertion");
export const NoBalanceDropsAssertionC = compileSol("assertions/NoBalanceDropsAssertion.sol", "NoBalanceDropsAssertion");

/** Where the attacker in our stories receives the loot. */
export const ATTACKER = "0x000000000000000000000000000000000000bad1" as const;
