"use client";

import { useState } from "react";
import { useAccount } from "@/app/providers";
import { useRouter } from "next/navigation";

export default function JoinMatchPage() {
  const { status } = useAccount();
  const isConnected = status === "connected";
  const router = useRouter();

  const [matchId, setMatchId] = useState("");

  const handleOpen = () => {
    if (!matchId) return;
    router.push(`/match/${matchId}`);
  };

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold tracking-wider">OPEN MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to play moves after opening the match.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Match ID</label>
        <input
          type="text"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          placeholder="Paste match ID"
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
        />
      </div>

      <div className="text-xs text-[#6a6a7a] leading-relaxed">
        Matches are fully assigned at creation time by the `create_match` contract call.
      </div>

      <button
        onClick={handleOpen}
        disabled={!matchId}
        className="w-full py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        OPEN MATCH
      </button>
    </div>
  );
}
