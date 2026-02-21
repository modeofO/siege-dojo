"use client";

import React from "react";
import { sepolia } from "@starknet-react/chains";
import {
  StarknetConfig,
  jsonRpcProvider,
  cartridge,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import type { SessionPolicies } from "@cartridge/controller";

const ACTIONS_ADDRESS =
  process.env.NEXT_PUBLIC_ACTIONS_ADDRESS || "0x0";
const COMMIT_REVEAL_ADDRESS =
  process.env.NEXT_PUBLIC_COMMIT_REVEAL_ADDRESS || "0x0";

const policies: SessionPolicies = {
  contracts: {
    [ACTIONS_ADDRESS]: {
      methods: [
        { name: "Create Match", entrypoint: "create_match" },
      ],
    },
    [COMMIT_REVEAL_ADDRESS]: {
      methods: [
        { name: "Commit", entrypoint: "commit" },
        { name: "Reveal Attacker", entrypoint: "reveal_attacker" },
        { name: "Reveal Defender", entrypoint: "reveal_defender" },
        { name: "Force Timeout", entrypoint: "force_timeout" },
      ],
    },
  },
};

const connector = new ControllerConnector({ policies });

const provider = jsonRpcProvider({
  rpc: () => ({
    nodeUrl:
      process.env.NEXT_PUBLIC_RPC_URL ||
      "https://api.cartridge.gg/x/starknet/sepolia",
  }),
});

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  return (
    <StarknetConfig
      autoConnect
      defaultChainId={sepolia.id}
      chains={[sepolia]}
      provider={provider}
      connectors={[connector]}
      explorer={cartridge}
    >
      {children}
    </StarknetConfig>
  );
}
