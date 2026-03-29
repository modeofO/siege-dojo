// Play as 3 opponent/teammate accounts for a match.
// Usage: MATCH_ID=3 npx tsx play-opponent.js

import { Account, RpcProvider, hash, CallData } from "starknet";

const MATCH_ID = parseInt(process.env.MATCH_ID || "3");
const RPC = process.env.STARKNET_RPC_URL || "http://localhost:5050";
const TORII = process.env.TORII_URL || "http://localhost:8080";
const COMMIT_REVEAL = process.env.COMMIT_REVEAL_ADDRESS || "0x06c61d75ff72a9b5ccf82cd78b48777f3486d10e8077cf9456a6feff0a0273c8";

const provider = new RpcProvider({ nodeUrl: RPC });

// Dev accounts 1-3 (account 0 is the human player)
const PLAYERS = [
  {
    address: "0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7",
    pk: "0x1c9053c053edf324aec366a34c6901b1095b07af69495bffec7d7fe21effb1b",
    role: "Team A Defender",
    type: "def",
  },
  {
    address: "0x17cc6ca902ed4e8baa8463a7009ff18cc294fa85a94b4ce6ac30a9ebd6057c7",
    pk: "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642",
    role: "Team B Attacker",
    type: "atk",
  },
  {
    address: "0x2af9427c5a277474c079a1283c880ee8a6f0f8fbf73ce969c08d88befec1bba",
    pk: "0x1800000000300000180000000000030000000000003006001800006600",
    role: "Team B Defender",
    type: "def",
  },
];

// Moves for each player
const MOVES = [
  { vals: [3, 3, 2, 1, 1, 0, 0], type: "def" },  // Team A Def: guard [3,3,2], repair 1, nodes [1,0,0]
  { vals: [4, 3, 3, 0, 0, 0],    type: "atk" },  // Team B Atk: pressure [4,3,3], nodes [0,0,0]
  { vals: [3, 3, 2, 1, 1, 0, 0], type: "def" },  // Team B Def: guard [3,3,2], repair 1, nodes [1,0,0]
];

const SALTS = ["0xdef111", "0xabc222", "0xdef333"];

function makeAccount(p) {
  return new Account({ provider, address: p.address, signer: p.pk });
}

const ZERO_BOUNDS = {
  l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
};

async function send(account, calls) {
  const tx = await account.execute(calls, {
    skipValidate: true,
    resourceBounds: ZERO_BOUNDS,
  });
  await provider.waitForTransaction(tx.transaction_hash);
  return tx;
}

async function getCommitCount() {
  const res = await fetch(`${TORII}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ siegeDojoRoundMovesModels(first: 10) { edges { node { match_id round commit_count reveal_count } } } }`,
    }),
  });
  const data = await res.json();
  const edges = data?.data?.siegeDojoRoundMovesModels?.edges || [];
  for (const e of edges) {
    const mid = parseInt(e.node.match_id);
    if (mid === MATCH_ID) {
      return {
        commits: parseInt(e.node.commit_count),
        reveals: parseInt(e.node.reveal_count),
      };
    }
  }
  return { commits: 0, reveals: 0 };
}

async function poll(check, label, intervalMs = 2000) {
  process.stdout.write(`   Waiting for ${label}...`);
  while (true) {
    if (await check()) { console.log(" done!"); return; }
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

console.log(`\n=== Playing match ${MATCH_ID} as 3 opponents ===\n`);

// Step 1: Commit for all 3 players
console.log("COMMIT PHASE");
const commitments = [];
for (let i = 0; i < 3; i++) {
  const m = MOVES[i];
  const elems = [BigInt(SALTS[i]), ...m.vals.map(BigInt)];
  commitments.push(hash.computePoseidonHashOnElements(elems));
}

for (let i = 0; i < 3; i++) {
  const acc = makeAccount(PLAYERS[i]);
  await send(acc, [{
    contractAddress: COMMIT_REVEAL,
    entrypoint: "commit",
    calldata: CallData.compile([MATCH_ID, commitments[i]]),
  }]);
  console.log(`   committed: ${PLAYERS[i].role}`);
}

// Wait for human to commit (4th commit)
await poll(async () => (await getCommitCount()).commits >= 4, "your commit");

// Step 2: Reveal for all 3 players
console.log("\nREVEAL PHASE");
for (let i = 0; i < 3; i++) {
  const acc = makeAccount(PLAYERS[i]);
  const m = MOVES[i];
  const entrypoint = m.type === "atk" ? "reveal_attacker" : "reveal_defender";
  await send(acc, [{
    contractAddress: COMMIT_REVEAL,
    entrypoint,
    calldata: CallData.compile([MATCH_ID, SALTS[i], ...m.vals]),
  }]);
  console.log(`   revealed: ${PLAYERS[i].role}`);
}

// Wait for human to reveal (4th reveal)
await poll(async () => (await getCommitCount()).reveals >= 4, "your reveal");

console.log("\nRound complete! Check the match page for results.\n");
