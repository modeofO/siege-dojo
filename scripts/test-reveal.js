import { Account, RpcProvider, hash, CallData } from "starknet";

const provider = new RpcProvider({ nodeUrl: "http://localhost:5050" });
const COMMIT_REVEAL = "0x05b709bbf6c548a4eac4268604b71f7dbd0fc4a43f2a0c9ed5de000531b3fd6a";
const ACTIONS = "0x02b93ff5747a6c5db5a4a616f76c1ad142a98352e54203e3dfa4fe26fe3fd136";

const ACCOUNTS = [
  { address: "0x359b9068eadcaaa449c08b79a367c6fdfba9448c29e96934e3552dab0fdd950", pk: "0x2bbf4f9fd0bbb2e60b0316c1fe0b76cf7a4d0198bd493ced9b8df2a3a24d68a", role: "Team A Attacker" },
  { address: "0x4184158a64a82eb982ff702e4041a49db16fa3a18229aac4ce88c832baf56e4", pk: "0x6bf3604bcb41fed6c42bcca5436eeb65083a982ff65db0dc123f65358008b51", role: "Team A Defender" },
  { address: "0x42b249d1633812d903f303d640a4261f58fead5aa24925a9efc1dd9d76fb555", pk: "0x283d1e73776cd4ac1ac5f0b879f561bded25eceb2cc589c674af0cec41df441", role: "Team B Attacker" },
  { address: "0x4e0b838810cb1a355beb7b3d894ca0e98ee524309c3f8b7cccb15a48e6270e2", pk: "0x736adbbcdac7cc600f89051db1abbc16b9996b46f6b58a9752a11c1028a8ec8", role: "Team B Defender" },
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
  body: JSON.stringify({ query: `{ siegeDojoMatchStateModels(where: { match_id: ${matchId} }) { edges { node { vault_a_hp vault_b_hp current_round status } } } }` }),
});
const result = await res2.json();
const state = result.data?.siegeDojoMatchStateModels?.edges?.[0]?.node;
if (state) {
  console.log(`   Vault A: ${state.vault_a_hp} HP`);
  console.log(`   Vault B: ${state.vault_b_hp} HP`);
  console.log(`   Round: ${state.current_round}`);
  console.log(`   Status: ${state.status}`);
} else {
  console.log("   Could not read state from Torii");
}
console.log("\nDone!");
