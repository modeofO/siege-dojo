"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { RpcProvider, Account } from "starknet";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:5050";

const DEV_ACCOUNTS = [
  {
    address: "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
    privateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
  },
  {
    address: "0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7",
    privateKey: "0x1c9053c053edf324aec366a34c6901b1095b07af69495bffec7d7fe21effb1b",
  },
  {
    address: "0x17cc6ca902ed4e8baa8463a7009ff18cc294fa85a94b4ce6ac30a9ebd6057c7",
    privateKey: "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642",
  },
  {
    address: "0x2af9427c5a277474c079a1283c880ee8a6f0f8fbf73ce969c08d88befec1bba",
    privateKey: "0x1800000000300000180000000000030000000000003006001800006600",
  },
];

interface DevAccountContextValue {
  account: Account;
  address: string;
  status: "connected";
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  accounts: typeof DEV_ACCOUNTS;
}

const DevAccountContext = createContext<DevAccountContextValue | null>(null);

export function useAccount() {
  const ctx = useContext(DevAccountContext);
  if (!ctx) throw new Error("useAccount must be used within StarknetProvider");
  return ctx;
}

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const provider = useMemo(() => new RpcProvider({ nodeUrl: RPC_URL }), []);

  const account = useMemo(() => {
    const { address, privateKey } = DEV_ACCOUNTS[selectedIndex];
    return new Account({ provider, address, signer: privateKey });
  }, [provider, selectedIndex]);

  const value: DevAccountContextValue = {
    account,
    address: DEV_ACCOUNTS[selectedIndex].address,
    status: "connected",
    selectedIndex,
    setSelectedIndex,
    accounts: DEV_ACCOUNTS,
  };

  return (
    <DevAccountContext.Provider value={value}>
      {children}
    </DevAccountContext.Provider>
  );
}
