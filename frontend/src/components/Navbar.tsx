"use client";

import Link from "next/link";
import { useAccount } from "@/app/providers";
import { AccountSelector } from "./AccountSelector";

export function Navbar() {
  const { address } = useAccount();
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <nav className="border-b border-[#2a2a3a] bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-widest text-[#00d4ff]">
          SIEGE
        </Link>
        <div className="flex items-center gap-4">
          <AccountSelector />
          <span className="text-sm text-[#6a6a7a]">{shortAddr}</span>
        </div>
      </div>
    </nav>
  );
}
