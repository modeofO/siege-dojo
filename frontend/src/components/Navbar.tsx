"use client";

import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";

export function Navbar() {
  return (
    <nav className="border-b border-[#2a2a3a] bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-widest text-[#00d4ff]">
          SIEGE
        </Link>
        <ConnectWallet />
      </div>
    </nav>
  );
}
