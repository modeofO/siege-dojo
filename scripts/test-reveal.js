import { Account, RpcProvider, hash, CallData } from "starknet";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const provider = new RpcProvider({
  nodeUrl: process.env.STARKNET_RPC_URL || "http://localhost:5050",
});

const COMMIT_REVEAL =
  process.env.COMMIT_REVEAL_ADDRESS ||
  "0x05b709bbf6c548a4eac4268604b71f7dbd0fc4a43f2a0c9ed5de000531b3fd6a";
const ACTIONS =
  process.env.ACTIONS_ADDRESS ||
  "0x02b93ff5747a6c5db5a4a616f76c1ad142a98352e54203e3dfa4fe26fe3fd136";

// Keep private keys in environment variables, never in source control.
const ACCOUNTS = [
  {
    address: requiredEnv("SIEGE_ACC0_ADDRESS"),
    pk: requiredEnv("SIEGE_ACC0_PK"),
    role: "Team A Attacker",
  },
  {
    address: requiredEnv("SIEGE_ACC1_ADDRESS"),
    pk: requiredEnv("SIEGE_ACC1_PK"),
    role: "Team A Defender",
  },
  {
    address: requiredEnv("SIEGE_ACC2_ADDRESS"),
    pk: requiredEnv("SIEGE_ACC2_PK"),
    role: "Team B Attacker",
  },
  {
    address: requiredEnv("SIEGE_ACC3_ADDRESS"),
    pk: requiredEnv("SIEGE_ACC3_PK"),
    role: "Team B Defender",
  },
];

function makeAccount(a) {
  return new Account({ provider, address: a.address, signer: a.pk });
}

// Skip fee estimation for Katana no-fee mode
const EXEC_OPTS = { maxFee: 0n };

async function exec(account, calls) {
  const tx = await account.execute(calls, EXEC_OPTS);
  await provider.waitForTransaction(tx.transaction_hash);
  return tx;
}

console.log("⚔️  Creating fresh match with new accounts...\n");

// Create match
const deployer = makeAccount(ACCOUNTS[0]);
const tx = await exec(deployer, [{
  contractAddress: ACTIONS,
  entrypoint: "create_match",
  calldata: CallData.compile([ACCOUNTS[0].address, ACCOUNTS[1].address, ACCOUNTS[2].address, ACCOUNTS[3].address]),
}]);
console.log("✅ Match created\n");

// Wait for Torii
await new Promise(r => setTimeout(r, 1500));
const res = await fetch("http://localhost:8080/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: `{ siegeDojoMatchStateModels(order: {field: MATCH_ID, direction: DESC}, limit: 1) { edges { node { match_id vault_a_hp vault_b_hp current_round } } } }` }),
});
const matchData = await res.json();
const matchId = parseInt(matchData.data.siegeDojoMatchStateModels.edges[0].node.match_id);
console.log(`Match ID: ${matchId}\n`);

// Define moves
const salts = ["0xaaa111", "0xbbb222", "0xccc333", "0xddd444"];
const moves = [
  { type: "atk", vals: [5, 3, 2, 0, 0, 0] },  // Team A Atk
  { type: "def", vals: [3, 3, 2, 1, 1, 0, 0] }, // Team A Def (g0,g1,g2,repair,nc0,nc1,nc2)
  { type: "atk", vals: [2, 3, 5, 0, 0, 0] },  // Team B Atk
  { type: "def", vals: [4, 2, 2, 1, 1, 0, 0] }, // Team B Def
];

// Compute hashes
const commitments = moves.map((m, i) => {
  const elems = [BigInt(salts[i]), ...m.vals.map(BigInt)];
  return hash.computePoseidonHashOnElements(elems);
});

// COMMIT
console.log("📝 COMMIT PHASE");
for (let i = 0; i < 4; i++) {
  const acc = makeAccount(ACCOUNTS[i]);
  try {
    await exec(acc, [{
      contractAddress: COMMIT_REVEAL,
      entrypoint: "commit",
      calldata: CallData.compile([matchId, commitments[i]]),
    }]);
    console.log(`   ✅ ${ACCOUNTS[i].role} committed`);
  } catch (e) {
    console.log(`   ❌ ${ACCOUNTS[i].role} commit failed: ${e.message?.slice(0, 150)}`);
  }
}

// REVEAL
console.log("\n🔓 REVEAL PHASE");
for (let i = 0; i < 4; i++) {
  const acc = makeAccount(ACCOUNTS[i]);
  const m = moves[i];
  const entrypoint = m.type === "atk" ? "reveal_attacker" : "reveal_defender";
  try {
    await exec(acc, [{
      contractAddress: COMMIT_REVEAL,
      entrypoint,
      calldata: CallData.compile([matchId, salts[i], ...m.vals]),
    }]);
    console.log(`   ✅ ${ACCOUNTS[i].role} revealed`);
  } catch (e) {
    console.log(`   ❌ ${ACCOUNTS[i].role} reveal failed: ${e.message?.slice(0, 300)}`);
  }
}

// RESULTS
await new Promise(r => setTimeout(r, 2000));
console.log("\n📊 RESULTS");
const res2 = await fetch("http://localhost:8080/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: `{ siegeDojoMatchStateModels(where: { match_idEQ: "${matchId}" }) { edges { node { vault_a_hp vault_b_hp current_round status } } } }` }),
});
const result = await res2.json();
if (result.errors) {
  console.log("   Torii query error:", JSON.stringify(result.errors));
  // Fallback: fetch all and filter
  const fallback = await fetch("http://localhost:8080/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ siegeDojoMatchStateModels(order: {field: MATCH_ID, direction: DESC}, first: 1) { edges { node { match_id vault_a_hp vault_b_hp current_round status } } } }` }),
  });
  const fb = await fallback.json();
  const s = fb.data?.siegeDojoMatchStateModels?.edges?.[0]?.node;
  if (s) {
    console.log(`   Vault A: ${s.vault_a_hp} HP`);
    console.log(`   Vault B: ${s.vault_b_hp} HP`);
    console.log(`   Round: ${s.current_round}`);
    console.log(`   Status: ${s.status}`);
  } else {
    console.log("   Could not read state from Torii (fallback also failed)");
  }
} else {
  const state = result.data?.siegeDojoMatchStateModels?.edges?.[0]?.node;
  if (state) {
    console.log(`   Vault A: ${state.vault_a_hp} HP`);
    console.log(`   Vault B: ${state.vault_b_hp} HP`);
    console.log(`   Round: ${state.current_round}`);
    console.log(`   Status: ${state.status}`);
  } else {
    console.log("   Could not read state from Torii");
  }
}

// Also show expected damage calc
console.log("\n📐 EXPECTED DAMAGE CALC");
console.log("   Team A attacks B vault: pressure=[5,3,2] vs B defense=[4,2,2]");
console.log("   Node 0: max(0, 5-4)=1, Node 1: max(0, 3-2)=1, Node 2: max(0, 2-2)=0 → 2 dmg, repair 1 → net 1");
console.log("   Team B attacks A vault: pressure=[2,3,5] vs A defense=[3,3,2]");
console.log("   Node 0: max(0, 2-3)=0, Node 1: max(0, 3-3)=0, Node 2: max(0, 5-2)=3 → 3 dmg, repair 1 → net 2");
console.log("   Expected: Vault A=98, Vault B=99");

console.log("\nDone!");
