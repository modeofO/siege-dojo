export interface AgentConfig {
  rpcUrl: string;
  privateKey: string;
  accountAddress: string;
  worldAddress: string;
  actionsAddress: string;
  commitRevealAddress: string;
  resolutionAddress: string;
  agentRole: "attacker" | "defender";
  matchId: number;
  pollIntervalMs: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AgentConfig {
  return {
    rpcUrl: env.STARKNET_RPC_URL || "http://localhost:5050",
    privateKey: env.STARKNET_PRIVATE_KEY || "",
    accountAddress: env.STARKNET_ACCOUNT_ADDRESS || "",
    worldAddress: env.WORLD_ADDRESS || "",
    actionsAddress: env.ACTIONS_ADDRESS || "",
    commitRevealAddress: env.COMMIT_REVEAL_ADDRESS || "",
    resolutionAddress: env.RESOLUTION_ADDRESS || "",
    agentRole: (env.AGENT_ROLE as "attacker" | "defender") || "attacker",
    matchId: parseInt(env.MATCH_ID || "1"),
    pollIntervalMs: parseInt(env.POLL_INTERVAL_MS || "5000"),
  };
}
