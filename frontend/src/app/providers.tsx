"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { RpcProvider, Account, type UniversalDetails } from "starknet";

// Katana devnet has no fees — skip estimation to avoid RPC compat issues
class KatanaAccount extends Account {
  override async execute(
    calls: Parameters<Account["execute"]>[0],
    details?: UniversalDetails
  ) {
    return super.execute(calls, {
      ...details,
      skipValidate: true,
      resourceBounds: {
        l1_gas: { max_amount: BigInt("0x2710"), max_price_per_unit: BigInt("0x6fc23ac00") },
        l2_gas: { max_amount: BigInt("0x989680"), max_price_per_unit: BigInt("0x6fc23ac00") },
        l1_data_gas: { max_amount: BigInt("0x0"), max_price_per_unit: BigInt("0x0") },
      },
    });
  }
}

const DEV_ACCOUNTS = [
  {
    address: "0xb3ff441a68610b30fd5e2abbf3a1548eb6ba6f3559f2862bf2dc757e5828ca",
    privateKey: "0x2bbf4f9fd0bbb2e60b0316c1fe0b76cf7a4d0198571b81adcf680327ebcd2",
  },
  {
    address: "0xe29882a1fcba1e7e10cad46212257fea5c752a4f9b1b1ec683c503a2cf5c8a",
    privateKey: "0x14d6672dcb4b77ca36a887e9a11cd9d637d5012468175829e9c6e770c61642",
  },
  {
    address: "0x29873c310fbefde666dc32a1554fea6bb45eecc84f680f8a2b0a8fbb8cb89af",
    privateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
  },
  {
    address: "0x2d71e9c974539bb3ffb4b115e66a23d0f62a641ea66c4016e903454c8753bbc",
    privateKey: "0x33003003001800009900180300d206308b0070db00121318d17b5e6262150b",
  },
];

interface DevAccountContextType {
  account: Account | null;
  address: string | undefined;
  isConnected: boolean;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  accounts: typeof DEV_ACCOUNTS;
}

const DevAccountContext = createContext<DevAccountContextType>({
  account: null,
  address: undefined,
  isConnected: false,
  selectedIndex: 0,
  setSelectedIndex: () => {},
  accounts: DEV_ACCOUNTS,
});

export function useAccount() {
  const ctx = useContext(DevAccountContext);
  return ctx;
}

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const provider = useMemo(
    () => new RpcProvider({ nodeUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:5050" }),
    []
  );

  const account = useMemo(() => {
    const dev = DEV_ACCOUNTS[selectedIndex];
    return new KatanaAccount({ provider, address: dev.address, signer: dev.privateKey });
  }, [provider, selectedIndex]);

  const value = useMemo(
    () => ({
      account,
      address: DEV_ACCOUNTS[selectedIndex].address,
      isConnected: true,
      selectedIndex,
      setSelectedIndex,
      accounts: DEV_ACCOUNTS,
    }),
    [account, selectedIndex]
  );

  return (
    <DevAccountContext.Provider value={value}>
      {children}
    </DevAccountContext.Provider>
  );
}
