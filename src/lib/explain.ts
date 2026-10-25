/** What each step prints under its title: what is going on, the parts involved, what to watch, and why it matters. */
interface Explanation {
  story: string;
  components: string;
  watch: string;
  why: string;
}

const EXPLANATIONS: Record<number, Explanation> = {
  1: {
    story:
      "A throwaway key is created for you in .env, the devnet faucet funds it, and then a frame transaction is dry-run on the node without being sent. A frame transaction (EIP-8141) is a list of frames instead of one call: a VERIFY frame that proves who signs and pays, and a SENDER frame that does the action.",
    components:
      "The ethrex Hegota devnet (chain 3151908), its faucet, and ethrex_simulateFrameTransaction, which answers whether the node would accept the transaction. src/lib/frameTx.ts builds the frames.",
    watch: "Green ticks for the chain id, your balance, and the simulation. The gas payer shown should be your own address.",
    why: "Every later step is a frame transaction, so this is the shortest path to seeing one work before assertions come in.",
  },
  2: {
    story:
      "You deploy a small DeFi world: a token (USDW), an honest dex, an evil dex that has the same swap(token) function, a second evil dex that only sweeps a token that emits no events, and that silent token. Then the script plays 'you, a while ago': you hold 100 of each token and have approved both evil dexes to spend them. These are ordinary transactions, not frame transactions.",
    components:
      "contracts/Playground.sol (Token, HonestDex, EvilDex). The script deploys each contract once and records the addresses in the state file, so re-runs are quick.",
    watch: "The dex addresses and your starting balances. The old approvals are the setup for the attack in step 3: people approve dapps all the time.",
    why: "The attack needs nothing exotic: a stale approval and a contract whose calldata looks like the honest one's.",
  },
  3: {
    story:
      "You sign 'swap 0.01 ETH for USDW' twice: once to the honest dex, once to the evil dex. The two transactions have the same shape and the same call data. The honest one gives you 10 USDW. The evil one gives you 1 wei of USDW and sweeps your approved USDW.",
    components:
      "A frame transaction with a VERIFY frame (your signature) and a SENDER frame (the swap call). The scenario helpers in src/lib/scenario.ts print your holdings before and after.",
    watch: "The holdings change after the second swap. The protocol sees nothing wrong: the transaction is valid, signed and included.",
    why: "A transaction states what it calls, not what it does. This is blind signing, and it is the problem EIP-7906 answers in the next steps.",
  },
  4: {
    story:
      "EIP-7906 adds a POST_TX frame mode. It runs last, read-only, and can look at what the transaction did using the TXTRACE opcode. If it reverts, the body of the transaction is undone, while the transaction stays included and the gas stays paid. Here the POST_TX frame says 'no more than 0.011 ETH may leave my account'. First an honest swap passes. Then a dapp slips in a 0.5 ETH transfer to the attacker, and the assertion rolls everything back.",
    components:
      "contracts/assertions/EthSpendLimitAssertion.sol reads the balance diffs. It inherits HegotaSupport from @forshtat/hegota-support, which gives plain Solidity the devnet's custom opcodes as functions. The gas payer is charged the maximum gas up front, which shows as a balance change, so the assertion subtracts it.",
    watch: "In the second case frames 1 and 2 report success and frame 3 fails, yet your balance only drops by gas.",
    why: "The check is enforced by the chain, not by a wallet UI that the dapp could bypass. You pay for the attempt, but the damage is undone.",
  },
  5: {
    story:
      "ETH balances are easy to check. For tokens the natural source is the event log. The assertion walks every event the transaction emitted and applies a receive-only policy: you must receive at least 9.9 USDW and no tokens may leave. The honest swap passes. The evil dex short-changes you and sweeps your approval, both show up as Transfer events, and everything is rolled back.",
    components:
      "contracts/assertions/TokenReceiveOnlyAssertion.sol, using TXTRACE to list events and EVENTDATACOPY to read the amount from event data. ETH moves also appear as Transfer-shaped events from a system address, which this assertion skips.",
    watch: "The USDW amount you end up with. After the evil swap you hold exactly what you had before, minus gas.",
    why: "It shows the event-based approach working. Step 6 shows where it breaks.",
  },
  6: {
    story:
      "Events are only what a contract chooses to emit. A token that never emits Transfer events can be drained invisibly. A second evil dex swaps fairly, so the event assertion from step 5 is satisfied, and quietly sweeps the silent token. You run three cases: the event assertion (you are robbed), a storage-diff assertion (blocked), and the storage-diff assertion on an honest swap (no false alarm).",
    components:
      "contracts/assertions/NoBalanceDropsAssertion.sol reads the storage slots that changed. Standard ERC-20 balances live at keccak256(owner, 0), the same slot position in every token, so one assertion covers tokens it has never heard of.",
    watch: "Case 1 prints that the assertion passed and you lost the SILENT tokens. Case 2 shows the same attack undone.",
    why: "State cannot lie the way logs can. The assertion is still a heuristic, though: a token with a different storage layout would slip past it.",
  },
  7: {
    story:
      "A transaction may carry several POST_TX frames, so several parties can add their own checks: your wallet (spend limit), the dapp (tokens received) and a security vendor (no balance drops). The script sends an honest swap with all three, then a nasty attack that combines a silent-token sweep with a hidden 0.5 ETH transfer.",
    components:
      "The three assertions from steps 4 to 6 in one frame list. POST_TX frames must form a contiguous suffix and run in order. Your signature covers the whole frame list, so nobody can remove an assertion after you sign.",
    watch: "The table of which assertion caught the attack. The first failing assertion stops the run, and later ones are shown as skipped.",
    why: "Independent authors can add protection without trusting each other. Who makes sure the assertions are actually present is a design question: a smart account can require them in its VERIFY code.",
  },
  8: {
    story:
      "Assertions are code, so they can be attacked. The event-reading assertion loops over every event, and the attacker controls how many events the body emits. The script sends an honest swap plus 300 junk events, first with a tight POST_TX gas limit (30,000) and then a roomy one (300,000).",
    components:
      "contracts/assertions/TokenReceiveOnlyAssertion.sol and the Spammer contract. An out-of-gas halt in a POST_TX frame counts as a failed assertion, so the body is rolled back.",
    watch: "The first run fails although the swap is honest. Compare the POST_TX gas used in both runs: that is the cost of 300 extra events.",
    why: "This fails closed: the attacker cannot sneak a bad transaction through, but can make your good one fail while you still pay. Budget assertion gas from the body's gas limit, and prefer checks whose cost does not grow with attacker-controlled data.",
  },
  9: {
    story:
      "So far the user attached the assertions. Here a protocol protects itself. LendingPool refuses to run unless the transaction carries a POST_TX frame that calls pool.postTransactionAssertion(), and that assertion checks the pool's solvency and that it never approved anyone. The pool has two real bugs: skim() drains reserves and approveRouter() gives the attacker an allowance. You try a call without the breaker, an honest deposit, then both exploits.",
    components:
      "contracts/LendingPool.sol with its withAssertion modifier, which uses TXPARAM, FRAMEPARAM and FRAMEDATALOAD (exposed by HegotaSupport) to inspect the enclosing transaction's frames, and postTransactionAssertion, which uses TXTRACE.",
    watch: "In both exploits frame 1 succeeds and the final POST_TX frame reverts. The pool's balance and the attacker's allowance are unchanged afterwards.",
    why: "A contract can enforce its own invariants even if one of its functions is buggy. This is a circuit breaker enforced by the protocol, not by monitoring after the money is gone.",
  },
  10: {
    story:
      "Your turn. Edit contracts/challenge/MyVaultAssertion.sol so it allows setSecret(42) and blocks transferOwnership(attacker) on a Vault. The script compiles your Solidity, checks both cases with free dry-runs, and only if you got both right sends the blocked attack for real so you can watch it fail on-chain.",
    components:
      "solc runs in-process (src/lib/compile.ts), HegotaSupport gives you the storage diff, and 'yarn step_10_solution' runs the reference solution in contracts/solutions/OwnerUnchangedAssertion.sol.",
    watch: "Two ticks: one for the harmless update allowed, one for the attack blocked. A red cross names which direction your assertion got wrong.",
    why: "A good assertion is narrow. One that blocks everything is as broken as one that blocks nothing.",
  },
};

function wrap(text: string, width: number, indent: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(indent + line);
  return lines.join("\n");
}

/** The explanation printed under the title of step `n`, or undefined if there is none. */
export function renderExplanation(n: number, width = 96): string | undefined {
  const e = EXPLANATIONS[n];
  if (!e) return undefined;
  const part = (label: string, body: string) => `\x1b[1m${label}\x1b[0m\n${wrap(body, width, "  ")}`;
  return [part("What is going on", e.story), part("Components", e.components), part("Watch for", e.watch), part("Why it matters", e.why)].join("\n");
}

export const explanationSteps = () => Object.keys(EXPLANATIONS).map(Number);
