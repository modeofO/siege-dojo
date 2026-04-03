#!/usr/bin/env npx tsx

import type { AccountInterface } from "starknet";
import { getAccount } from "./auth.js";
import {
  fetchMatchState,
  fetchRoundStatus,
  fetchRoundMoves,
  generateSalt,
  computeCommitment,
  createMatch,
  commitMove,
  revealMove,
  type MatchInfo,
  type MoveAllocation,
} from "./chain.js";
import {
  computeBudget,
  validateMove,
  parseJsonMove,
  promptMove,
  displayMatchStatus,
  displayRoundResults,
  closePrompt,
} from "./game.js";

// --------------- Address normalization ---------------

function normalizeAddress(addr: string): string {
  return "0x" + BigInt(addr).toString(16);
}

// --------------- Arg parsing ---------------

interface CLIArgs {
  create: boolean;
  opponent: string | null;
  matchId: string | null;
  jsonMove: string | null;
  usePrivateKey: boolean;
  player: "a" | "b" | null;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    create: false,
    opponent: null,
    matchId: null,
    jsonMove: null,
    usePrivateKey: false,
    player: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--create":
        result.create = true;
        break;
      case "--opponent":
        result.opponent = args[++i] || null;
        break;
      case "--match":
        result.matchId = args[++i] || null;
        break;
      case "--json":
        result.jsonMove = args[++i] || null;
        break;
      case "--use-private-key":
        result.usePrivateKey = true;
        break;
      case "--player":
        {
          const val = (args[++i] || "").toLowerCase();
          if (val === "a" || val === "b") {
            result.player = val;
          } else {
            console.error("Error: --player must be 'a' or 'b'");
            process.exit(1);
          }
        }
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
siege-cli — 1v1 Siege Dojo CLI

Usage:
  npx tsx siege-cli.ts --create --opponent <addr> [--player a|b] [--use-private-key]
  npx tsx siege-cli.ts --match <id> [--json '<move>'] [--use-private-key]

Options:
  --create              Create a new 1v1 match
  --opponent <addr>     Opponent's Starknet address (required with --create)
  --match <id>          Join an existing match by ID
  --json '<move>'       Submit move as JSON (single round, then exit)
                        Format: {"attack":[a,b,c],"defense":[a,b,c],"repair":n,"nodes":[0,1,0]}
  --use-private-key     Use DOJO_ACCOUNT_ADDRESS/DOJO_PRIVATE_KEY instead of Cartridge
  --player a|b          Which side you play when creating (default: a)

Environment:
  DOJO_ACCOUNT_ADDRESS  Your Starknet account address (with --use-private-key)
  DOJO_PRIVATE_KEY      Your private key (with --use-private-key)
  ACTIONS_1V1_ADDRESS   Actions contract address override
  COMMIT_REVEAL_1V1_ADDRESS  CommitReveal contract address override
  NEXT_PUBLIC_RPC_URL   Starknet RPC URL override
  NEXT_PUBLIC_TORII_URL Torii URL override
`);
}

// --------------- Polling helpers ---------------

async function poll<T>(
  check: () => Promise<T | null>,
  label: string,
  intervalMs = 3000,
): Promise<T> {
  process.stdout.write(`Waiting for ${label}...`);
  while (true) {
    const result = await check();
    if (result !== null) {
      console.log(" done!");
      return result;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// --------------- Round flow ---------------

async function playRound(
  account: AccountInterface,
  matchId: string,
  info: MatchInfo,
  isPlayerA: boolean,
  jsonMove: string | null,
): Promise<MatchInfo | null> {
  const round = info.currentRound;
  const budget = computeBudget(info.nodes, isPlayerA);

  // 1. Get move (JSON or interactive)
  let move: MoveAllocation;
  if (jsonMove) {
    const parsed = parseJsonMove(jsonMove);
    if (!parsed) {
      console.error("Error: Invalid JSON move format");
      return null;
    }
    const err = validateMove(parsed, budget);
    if (err) {
      console.error(`Error: ${err}`);
      return null;
    }
    move = parsed;
  } else {
    move = await promptMove(budget);
  }

  // 2. Generate salt and compute commitment
  const salt = generateSalt();
  const commitment = computeCommitment(salt, move);

  // 3. Submit commit tx
  console.log("Submitting commit...");
  try {
    const commitHash = await commitMove(account, matchId, commitment);
    console.log(`  Commit tx: ${commitHash}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Commit failed: ${msg}`);
    return null;
  }

  // 4. Poll until commitCount >= 2
  await poll(
    async () => {
      const status = await fetchRoundStatus(matchId, round);
      return status.commitCount >= 2 ? true : null;
    },
    "opponent commit",
  );

  // 5. Submit reveal tx
  console.log("Submitting reveal...");
  try {
    const revealHash = await revealMove(account, matchId, salt, move);
    console.log(`  Reveal tx: ${revealHash}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Reveal failed: ${msg}`);
    return null;
  }

  // 6. Poll until revealCount >= 2
  await poll(
    async () => {
      const status = await fetchRoundStatus(matchId, round);
      return status.revealCount >= 2 ? true : null;
    },
    "opponent reveal",
  );

  // 7. Wait for Torii indexing
  console.log("Waiting for resolution indexing...");
  await new Promise((r) => setTimeout(r, 3000));

  // 8. Fetch round moves and new match state
  const moves = await fetchRoundMoves(matchId, round);
  const newInfo = await fetchMatchState(matchId);

  if (!moves || !newInfo) {
    console.error("Error: Could not fetch round results.");
    return null;
  }

  // 9. Display results
  const theirAttack = isPlayerA ? moves.bAttack : moves.aAttack;
  const theirDefense = isPlayerA ? moves.bDefense : moves.aDefense;

  displayRoundResults(move, theirAttack, theirDefense, newInfo, isPlayerA);

  return newInfo;
}

// --------------- Main ---------------

async function main(): Promise<void> {
  const args = parseArgs();

  // Validate args
  if (!args.create && !args.matchId) {
    printUsage();
    process.exit(1);
  }

  if (args.create && !args.opponent) {
    console.error("Error: --create requires --opponent <address>");
    process.exit(1);
  }

  // Authenticate
  const account = await getAccount({ usePrivateKey: args.usePrivateKey });
  const myAddress = normalizeAddress(
    "address" in account ? (account as { address: string }).address : ""
  );
  console.log(`Using address: ${myAddress}`);

  let matchId: string;

  if (args.create) {
    // Create match
    const opponent = args.opponent!;
    let playerA: string;
    let playerB: string;

    if (args.player === "b") {
      playerA = opponent;
      playerB = myAddress;
    } else {
      playerA = myAddress;
      playerB = opponent;
    }

    console.log(`Creating 1v1 match: A=${playerA} vs B=${playerB}`);
    try {
      const txHash = await createMatch(account, playerA, playerB);
      console.log(`  Create tx: ${txHash}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Create failed: ${msg}`);
      process.exit(1);
    }

    // Wait for indexing
    console.log("Waiting for Torii to index the new match...");
    await new Promise((r) => setTimeout(r, 5000));

    console.log(
      "\nMatch created! To find your match ID, check Torii or the transaction events."
    );
    console.log("Then rejoin with: npx tsx siege-cli.ts --match <id>");
    console.log("(Automatic match ID detection from tx events coming soon)");
    process.exit(0);
  } else {
    matchId = args.matchId!;
  }

  // Fetch initial match state
  const info = await fetchMatchState(matchId);
  if (!info) {
    console.error(`Error: Match #${matchId} not found on Torii.`);
    process.exit(1);
  }

  // Determine role
  const normA = normalizeAddress(info.playerA);
  const normB = normalizeAddress(info.playerB);
  let isPlayerA: boolean;

  if (normalizeAddress(myAddress) === normA) {
    isPlayerA = true;
  } else if (normalizeAddress(myAddress) === normB) {
    isPlayerA = false;
  } else {
    console.error(
      `Error: Your address ${myAddress} does not match player A (${normA}) or player B (${normB})`
    );
    process.exit(1);
  }

  displayMatchStatus(info, isPlayerA);

  if (info.status === "Finished") {
    console.log("This match is already finished.");
    process.exit(0);
  }

  // JSON mode: single round
  if (args.jsonMove) {
    await playRound(account, matchId, info, isPlayerA, args.jsonMove);
    closePrompt();
    process.exit(0);
  }

  // Interactive loop
  let currentInfo = info;
  while (currentInfo.status !== "Finished") {
    const newInfo = await playRound(account, matchId, currentInfo, isPlayerA, null);
    if (!newInfo) {
      console.error("Round failed. Retrying in 5 seconds...");
      await new Promise((r) => setTimeout(r, 5000));
      const refreshed = await fetchMatchState(matchId);
      if (!refreshed) {
        console.error("Could not refresh match state. Exiting.");
        break;
      }
      currentInfo = refreshed;
      displayMatchStatus(currentInfo, isPlayerA);
      continue;
    }

    currentInfo = newInfo;

    if (currentInfo.status === "Finished") {
      break;
    }

    // Refresh for next round
    displayMatchStatus(currentInfo, isPlayerA);
  }

  console.log("Match complete. Thanks for playing!");
  closePrompt();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  closePrompt();
  process.exit(1);
});
