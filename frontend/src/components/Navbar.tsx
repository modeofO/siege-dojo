"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <nav className="border-b border-[#2a2a3a] bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-widest text-[#00d4ff]">
          SIEGE
        </Link>
        <div className="flex items-center gap-4">
          {isConnected ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#6a6a7a]">{shortAddr}</span>
              <button
                onClick={() => disconnect()}
                className="text-xs px-3 py-1.5 border border-[#2a2a3a] rounded hover:border-[#ff3344] hover:text-[#ff3344] transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {connectors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => connect({ connector: c })}
                  className="text-xs px-3 py-1.5 bg-[#12121a] border border-[#2a2a3a] rounded hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
