"use client";

import React from "react";
import { sepolia } from "@starknet-react/chains";
import { StarknetConfig, publicProvider } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";

// Siege game contract addresses — update after deployment
const COMMIT_REVEAL_ADDRESS = process.env.NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS || "0x0";
const ACTIONS_ADDRESS = process.env.NEXT_PUBLIC_ACTIONS_ADDRESS || "0x0";

// Session policies: pre-approve Siege game transactions so they're gasless + instant
const policies = {
  contracts: {
    [COMMIT_REVEAL_ADDRESS]: {
      name: "Siege Commit-Reveal",
      methods: [
        { name: "Commit Move", entrypoint: "commit" },
        { name: "Reveal Attacker Move", entrypoint: "reveal_attacker" },
        { name: "Reveal Defender Move", entrypoint: "reveal_defender" },
        { name: "Force Timeout", entrypoint: "force_timeout" },
      ],
    },
    [ACTIONS_ADDRESS]: {
      name: "Siege Actions",
      methods: [
        { name: "Create Match", entrypoint: "create_match" },
      ],
    },
  },
} as const;

const cartridge = new ControllerConnector({
  policies: policies as any,
  chains: [{ rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia" }],
}) as any;

const chains = [sepolia];
const connectors = [cartridge];

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      chains={chains}
      provider={publicProvider()}
      connectors={connectors}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
