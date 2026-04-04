// frontend/src/app/match-1v1/create/page.tsx
"use client";

import { useState } from "react";
import { useAccount } from "@/app/providers";
import { createMatch1v1 } from "@/lib/contracts1v1";
import Link from "next/link";

const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestMatchId(): Promise<string | null> {
  const res = await fetch(`${TORII_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{
        siegeDojoMatchCounterModels(first: 1) {
          edges { node { count } }
        }
      }`,
    }),
  });
  const data = await res.json();
  const count = data?.data?.siegeDojoMatchCounterModels?.edges?.[0]?.node?.count;
  if (count == null) return null;
  return String(typeof count === "string" && count.startsWith("0x") ? parseInt(count, 16) : Number(count));
}

export default function Create1v1Page() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";

  const [opponentAddr, setOpponentAddr] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!account || !address || !opponentAddr) return;

    setLoading(true);
    setError("");

    try {
      const result = await createMatch1v1(account, address, opponentAddr);

      for (let i = 0; i < 8; i++) {
        try {
          const id = await fetchLatestMatchId();
          if (id) {
            setMatchId(id);
            return;
          }
        } catch {
          // Torii may still be syncing
        }
        await sleep(1500);
      }

      setError(
        `Transaction submitted (${result.transaction_hash}), but Torii has not indexed the match yet. Try refreshing.`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  if (matchId) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-6">
        <div className="text-2xl font-bold text-[#ffd700]">1v1 Match Created</div>
        <div className="text-sm text-[#6a6a7a]">Share this match ID with your opponent:</div>
        <div className="bg-[#12121a] border border-[#2a2a3a] rounded p-4 text-2xl font-bold">
          {matchId}
        </div>
        <Link
          href={`/match-1v1/${matchId}`}
          className="inline-block px-6 py-2 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded text-sm hover:bg-[#ffd700]/20 transition-colors"
        >
          GO TO MATCH →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold tracking-wider">CREATE 1v1 MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to create a match
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Opponent Address</label>
        <input
          type="text"
          value={opponentAddr}
          onChange={(e) => setOpponentAddr(e.target.value)}
          placeholder="Paste opponent's wallet address (0x...)"
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#ffd700] focus:outline-none transition-colors font-mono"
        />
      </div>

      <div className="text-xs text-[#6a6a7a] leading-relaxed">
        You will be Player A. Your opponent will join as Player B using the match ID.
      </div>

      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}

      <button
        onClick={handleCreate}
        disabled={!isConnected || !opponentAddr || loading}
        className="w-full py-3 bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700] rounded hover:bg-[#ffd700]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "CREATING..." : "CREATE 1v1 MATCH"}
      </button>
    </div>
  );
}
