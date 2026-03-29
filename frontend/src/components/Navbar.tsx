"use client";

import Link from "next/link";
import { isDevMode } from "@/app/providers";
import { AccountSelector } from "./AccountSelector";
import { ConnectWallet } from "./ConnectWallet";

export function Navbar() {
  return (
    <nav className="border-b border-[#2a2a3a] bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-widest text-[#00d4ff]">
            SIEGE
          </Link>
          <Link href="/how-to-play" className="text-xs text-[#6a6a7a] hover:text-[#00d4ff] transition-colors tracking-wider">
            HOW TO PLAY
          </Link>
        </div>
        {isDevMode() ? <AccountSelector /> : <ConnectWallet />}
      </div>
    </nav>
  );
}
