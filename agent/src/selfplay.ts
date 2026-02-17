#!/usr/bin/env node
import { RpcProvider, Account, Contract } from "starknet";
import { SiegeAgent } from "./agent.js";
import type { AgentConfig } from "./config.js";
import { getActionsAbi, GameStateReader } from "./state.js";

// Katana dev accounts (pre-funded)
const KATANA_ACCOUNTS = [
  { address: "0xb3ff441a68610b30fd5e2abbf3a1548eb6ba6f3559f2862bf2dc757e5828ca", privateKey: "0x2bbf4f9fd0bbd1008f729bf498752189ed0a87e9e29cc7b94e50989ad3e2c1f" },
  { address: "0xe29882a1fcba1e7e10cad46212257fea5c752a4f9b1b1ec683c503a2cf5c8a", privateKey: "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e3c6f3b1d0eb749" },
  { address: "0x29873c310fbefde666dc32a1554fea6bb45eecc84f680f8a2b0a8fbb8cb89af", privateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912" },
  { address: "0x2d71e9c974539bb3ffb4b115e66a23d0f62a641ea66c4016e903454c8753bbc", privateKey: "0x33003003001800009900180300d206308b0070db00121318d17b5e6262150b" },
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const rpcUrl = process.env.STARKNET_RPC_URL || "http://localhost:5050";
  const worldAddress = process.env.WORLD_ADDRESS!;
  const actionsAddress = process.env.ACTIONS_ADDRESS!;
  const commitRevealAddress = process.env.COMMIT_REVEAL_ADDRESS!;
  const resolutionAddress = process.env.RESOLUTION_ADDRESS || "";

  if (!worldAddress || !actionsAddress || !commitRevealAddress) {
    console.error("Required: WORLD_ADDRESS, ACTIONS_ADDRESS, COMMIT_REVEAL_ADDRESS");
    process.exit(1);
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const [teamAAtk, teamADef, teamBAtk, teamBDef] = KATANA_ACCOUNTS;

  // Create match
  console.log("Creating match...");
  const creator = new Account({ provider, address: teamAAtk.address, signer: teamAAtk.privateKey });
  const actionsContract = new Contract({ abi: getActionsAbi(), address: actionsAddress, providerOrAccount: creator });

  const createResult = await actionsContract.invoke("create_match", [
    teamAAtk.address, teamADef.address, teamBAtk.address, teamBDef.address,
  ]);
  await creator.waitForTransaction(createResult.transaction_hash);

  const matchId = 1;
  console.log(`Match created: ID=${matchId}`);

  const reader = new GameStateReader(provider, worldAddress, actionsAddress, commitRevealAddress);
  const matchState = await reader.getMatchState(matchId);
  console.log(`Status: ${matchState.status}, Round: ${matchState.currentRound}`);
  console.log(`Vault A: ${matchState.vaultAHp}, Vault B: ${matchState.vaultBHp}`);

  // Create 4 agents
  const players = [
    { ...teamAAtk, role: "attacker" as const, label: "TeamA-Atk" },
    { ...teamADef, role: "defender" as const, label: "TeamA-Def" },
    { ...teamBAtk, role: "attacker" as const, label: "TeamB-Atk" },
    { ...teamBDef, role: "defender" as const, label: "TeamB-Def" },
  ];

  const agents = players.map(p => {
    const config: AgentConfig = {
      rpcUrl,
      privateKey: p.privateKey,
      accountAddress: p.address,
      worldAddress,
      actionsAddress,
      commitRevealAddress,
      resolutionAddress,
      agentRole: p.role,
      matchId,
      pollIntervalMs: 500,
    };
    return {
      agent: new SiegeAgent(config, (msg: string) => console.log(`[${p.label}] ${msg}`)),
      label: p.label,
    };
  });

  console.log("\n=== Starting Self-Play ===\n");

  let gameActive = true;
  let iterations = 0;
  const MAX_ITERS = 1000;

  while (gameActive && iterations < MAX_ITERS) {
    const results = await Promise.all(
      agents.map(async ({ agent, label }) => {
        try { return await agent.tick(); }
        catch (err: any) { console.log(`[${label}] Error: ${err.message}`); return true; }
      }),
    );
    gameActive = results.some(r => r);
    iterations++;
    if (gameActive) await sleep(200);

    if (iterations % 20 === 0) {
      try {
        const state = await reader.getMatchState(matchId);
        const nodes = await reader.getAllNodes(matchId);
        console.log(`\n--- Round ${state.currentRound} | A:${state.vaultAHp} B:${state.vaultBHp} | Nodes: ${nodes.map(n => n.owner).join(",")} ---\n`);
      } catch {}
    }
  }

  const final = await reader.getMatchState(matchId);
  const nodes = await reader.getAllNodes(matchId);
  console.log("\n=== Game Over ===");
  console.log(`Round: ${final.currentRound}, Status: ${final.status}`);
  console.log(`Vault A: ${final.vaultAHp}, Vault B: ${final.vaultBHp}`);
  console.log(`Nodes: ${nodes.map(n => `${n.nodeIndex}=${n.owner}`).join(", ")}`);
  console.log(final.vaultAHp === 0 && final.vaultBHp === 0 ? "DRAW" :
    final.vaultAHp === 0 ? "Team B wins!" : final.vaultBHp === 0 ? "Team A wins!" : "In progress");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
