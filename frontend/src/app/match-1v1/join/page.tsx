// frontend/src/app/match-1v1/join/page.tsx
"use client";

import { useState } from "react";
import { useAccount } from "@/app/providers";
import { useRouter } from "next/navigation";

export default function Join1v1Page() {
  const { status } = useAccount();
  const isConnected = status === "connected";
  const router = useRouter();

  const [matchId, setMatchId] = useState("");

  const handleJoin = () => {
    if (!matchId) return;
    router.push(`/match-1v1/${matchId}`);
  };

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold tracking-wider">JOIN 1v1 MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to play.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Match ID</label>
        <input
          type="text"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          placeholder="Enter match ID"
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#ffd700] focus:outline-none transition-colors"
        />
      </div>

      <button
        onClick={handleJoin}
        disabled={!matchId}
        className="w-full py-3 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        JOIN MATCH
      </button>
    </div>
  );
}
