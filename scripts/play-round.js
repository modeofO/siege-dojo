/**
 * Siege — Full Round End-to-End Test
 * 
 * Creates a match with 4 Katana dev accounts, plays one full round
 * (commit → reveal → resolve), and prints the results.
 * 
 * Usage: node play-round.js
 */

import { Account, RpcProvider, hash, CallData, cairo } from "starknet";

// ============ Config ============

const RPC_URL = "http://localhost:5050";
const TORII_URL = "http://localhost:8080";

// Contract addresses (from sozo inspect)
const ACTIONS = "0x02b93ff5747a6c5db5a4a616f76c1ad142a98352e54203e3dfa4fe26fe3fd136";
const COMMIT_REVEAL = "0x05b709bbf6c548a4eac4268604b71f7dbd0fc4a43f2a0c9ed5de000531b3fd6a";

// Katana dev accounts (first 4)
const PLAYERS = [
  { // Team A Attacker
    address: "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
    privateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
    role: "Team A Attacker",
  },
  { // Team A Defender
    address: "0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7",
    privateKey: "0x1c9053c053edf324aec366a34c6901b1095b07af69495bffec7d7fe21effb1b",
    role: "Team A Defender",
  },
  { // Team B Attacker
    address: "0x17cc6ca902ed4e8baa8463a7009ff18cc294fa85a94b4ce6ac30a9ebd6057c7",
    privateKey: "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642",
    role: "Team B Attacker",
  },
  { // Team B Defender
    address: "0x2af9427c5a277474c079a1283c880ee8a6f0f8fbf73ce969c08d88befec1bba",
    privateKey: "0x1800000000300000180000000000030000000000003006001800006600",
    role: "Team B Defender",
  },
];

// ============ Helpers ============

const provider = new RpcProvider({ nodeUrl: RPC_URL });

function makeAccount(player) {
  return new Account({ provider, address: player.address, signer: player.privateKey });
}

function poseidonHash(values) {
  // starknet.js computePoseidonHashOnElements matches Cairo's PoseidonTrait chain
  return hash.computePoseidonHashOnElements(values.map(v => BigInt(v)));
}

function randomSalt() {
  return "0x" + Array.from(crypto.getRandomValues(new Uint8Array(31)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function queryTorii(query) {
  const res = await fetch(`${TORII_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

// ============ Game Actions ============

async function createMatch() {
  console.log("\n🏰 Creating match...");
  const deployer = makeAccount(PLAYERS[0]);
  
  const tx = await deployer.execute([{
    contractAddress: ACTIONS,
    entrypoint: "create_match",
    calldata: CallData.compile([
      PLAYERS[0].address, // team_a_attacker
      PLAYERS[1].address, // team_a_defender
      PLAYERS[2].address, // team_b_attacker
      PLAYERS[3].address, // team_b_defender
    ]),
  }]);
  
  await provider.waitForTransaction(tx.transaction_hash);
  console.log(`   ✅ Match created (tx: ${tx.transaction_hash.slice(0, 18)}...)`);
  
  // Query match state from Torii
  await new Promise(r => setTimeout(r, 1000)); // wait for indexing
  const result = await queryTorii(`{
    siegeDojoMatchStateModels(order: { field: MATCH_ID, direction: DESC }, limit: 1) {
      edges { node { match_id vault_a_hp vault_b_hp current_round status } }
    }
  }`);
  
  const match = result.data?.siegeDojoMatchStateModels?.edges?.[0]?.node;
  if (match) {
    console.log(`   Match #${match.match_id}: Vault A=${match.vault_a_hp} HP, Vault B=${match.vault_b_hp} HP, Round ${match.current_round}`);
    return parseInt(match.match_id);
  }
  
  // Fallback: assume match_id = 1
  console.log("   (Torii query didn't return match, assuming match_id=1)");
  return 1;
}

async function commitMove(player, matchId, commitment) {
  const account = makeAccount(player);
  console.log(`   ${player.role} committing...`);
  
  const tx = await account.execute([{
    contractAddress: COMMIT_REVEAL,
    entrypoint: "commit",
    calldata: CallData.compile([
      matchId,       // match_id (u64)
      commitment,    // commitment (felt252)
    ]),
  }]);
  
  await provider.waitForTransaction(tx.transaction_hash);
  console.log(`   ✅ ${player.role} committed`);
}

async function revealAttacker(player, matchId, salt, p0, p1, p2, nc0, nc1, nc2) {
  const account = makeAccount(player);
  console.log(`   ${player.role} revealing: pressure=[${p0},${p1},${p2}] nodes=[${nc0},${nc1},${nc2}]`);
  
  const tx = await account.execute([{
    contractAddress: COMMIT_REVEAL,
    entrypoint: "reveal_attacker",
    calldata: CallData.compile([
      matchId, salt, p0, p1, p2, nc0, nc1, nc2,
    ]),
  }]);
  
  await provider.waitForTransaction(tx.transaction_hash);
  console.log(`   ✅ ${player.role} revealed`);
}

async function revealDefender(player, matchId, salt, g0, g1, g2, repair, nc0, nc1, nc2) {
  const account = makeAccount(player);
  console.log(`   ${player.role} revealing: garrison=[${g0},${g1},${g2}] repair=${repair} nodes=[${nc0},${nc1},${nc2}]`);
  
  const tx = await account.execute([{
    contractAddress: COMMIT_REVEAL,
    entrypoint: "reveal_defender",
    calldata: CallData.compile([
      matchId, salt, g0, g1, g2, repair, nc0, nc1, nc2,
    ]),
  }]);
  
  await provider.waitForTransaction(tx.transaction_hash);
  console.log(`   ✅ ${player.role} revealed`);
}

// ============ Main ============

async function main() {
  console.log("⚔️  SIEGE — End-to-End Round Test");
  console.log("=".repeat(50));
  
  // Step 1: Create match
  const matchId = await createMatch();
  
  // Step 2: Define moves
  // Team A Attacker: concentrate on east gate (5), spread rest (3,2), no nodes
  const atkA = { p: [5, 3, 2], nc: [0, 0, 0] };
  // Team A Defender: balanced garrison (3,3,2), 1 repair, contest node 0
  const defA = { g: [3, 3, 2], repair: 1, nc: [1, 0, 0] };
  // Team B Attacker: heavy underground (2,3,5), no nodes
  const atkB = { p: [2, 3, 5], nc: [0, 0, 0] };
  // Team B Defender: heavy east defense (4,2,2), 1 repair, contest node 1
  const defB = { g: [4, 2, 2], repair: 1, nc: [1, 0, 0] };
  
  // Step 3: Compute commitments
  const salts = [randomSalt(), randomSalt(), randomSalt(), randomSalt()];
  
  const commitA_atk = poseidonHash([salts[0], ...atkA.p, ...atkA.nc]);
  const commitA_def = poseidonHash([salts[1], ...defA.g, defA.repair, ...defA.nc]);
  const commitB_atk = poseidonHash([salts[2], ...atkB.p, ...atkB.nc]);
  const commitB_def = poseidonHash([salts[3], ...defB.g, defB.repair, ...defB.nc]);
  
  console.log("\n📝 Phase 1: COMMIT");
  console.log("-".repeat(50));
  
  // All 4 players commit
  await commitMove(PLAYERS[0], matchId, commitA_atk);
  await commitMove(PLAYERS[1], matchId, commitA_def);
  await commitMove(PLAYERS[2], matchId, commitB_atk);
  await commitMove(PLAYERS[3], matchId, commitB_def);
  
  console.log("\n🔓 Phase 2: REVEAL");
  console.log("-".repeat(50));
  
  // All 4 players reveal
  await revealAttacker(PLAYERS[0], matchId, salts[0], ...atkA.p, ...atkA.nc);
  await revealDefender(PLAYERS[1], matchId, salts[1], ...defA.g, defA.repair, ...defA.nc);
  await revealAttacker(PLAYERS[2], matchId, salts[2], ...atkB.p, ...atkB.nc);
  await revealDefender(PLAYERS[3], matchId, salts[3], ...defB.g, defB.repair, ...defB.nc);
  
  // Step 4: Check results
  console.log("\n📊 Phase 3: RESULTS");
  console.log("-".repeat(50));
  
  // Expected damage calculation:
  // Team A attacks Team B's vault: atk_a vs def_b
  //   East:        5 - 4 = 1 damage
  //   West:        3 - 2 = 1 damage
  //   Underground: 2 - 2 = 0 damage
  //   Total damage to B: 2
  //   B had repair=1, so HP_B = 100 + 1 = 101 -> cap 100, then -2 = 98
  //
  // Team B attacks Team A's vault: atk_b vs def_a
  //   East:        2 - 3 = 0 damage
  //   West:        3 - 3 = 0 damage
  //   Underground: 5 - 2 = 3 damage
  //   Total damage to A: 3
  //   A had repair=1, so HP_A = 100 + 1 = 101 -> cap 100, then -3 = 97
  
  console.log("\n   Expected:");
  console.log("   Team A attacks B: (5-4)+(3-2)+(2-2) = 2 damage");
  console.log("   Team B attacks A: (2-3)+(3-3)+(5-2) = 3 damage");
  console.log("   Vault A: 100 +1 repair → 100 (cap) -3 = 97 HP");
  console.log("   Vault B: 100 +1 repair → 100 (cap) -2 = 98 HP");
  
  await new Promise(r => setTimeout(r, 2000)); // wait for Torii
  
  const result = await queryTorii(`{
    siegeDojoMatchStateModels(order: { field: MATCH_ID, direction: DESC }, limit: 1) {
      edges { node { match_id vault_a_hp vault_b_hp current_round status } }
    }
  }`);
  
  const match = result.data?.siegeDojoMatchStateModels?.edges?.[0]?.node;
  if (match) {
    console.log(`\n   Actual (from Torii):`);
    console.log(`   Vault A: ${match.vault_a_hp} HP`);
    console.log(`   Vault B: ${match.vault_b_hp} HP`);
    console.log(`   Round: ${match.current_round}`);
    console.log(`   Status: ${match.status}`);
    
    const aOk = parseInt(match.vault_a_hp) === 97;
    const bOk = parseInt(match.vault_b_hp) === 98;
    console.log(`\n   ${aOk && bOk ? "✅ PASS — damage math checks out!" : "❌ MISMATCH — expected A=97, B=98"}`);
  } else {
    console.log("   ⚠️  Could not query Torii for results");
  }
  
  // Node contest results
  const nodeResult = await queryTorii(`{
    siegeDojoNodeStateModels(where: { match_id: ${matchId} }) {
      edges { node { match_id node_index owner } }
    }
  }`);
  
  const nodes = nodeResult.data?.siegeDojoNodeStateModels?.edges?.map(e => e.node) || [];
  if (nodes.length > 0) {
    console.log("\n   Resource Nodes:");
    for (const n of nodes) {
      const ownerName = n.owner === "0" ? "None" : n.owner === "1" ? "Team A" : "Team B";
      console.log(`   Node ${n.node_index}: ${ownerName}`);
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("⚔️  Round complete!\n");
}

main().catch(e => {
  console.error("❌ Error:", e.message || e);
  process.exit(1);
});
