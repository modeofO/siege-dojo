"use client";

import { useState } from "react";
import { useAccount } from "@starknet-react/core";
import { createMatch } from "@/lib/contracts";
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
          edges {
            node { count }
          }
        }
      }`,
    }),
  });
  const data = await res.json();
  const count = data?.data?.siegeDojoMatchCounterModels?.edges?.[0]?.node?.count;
  return count != null ? String(count) : null;
}

export default function CreateMatchPage() {
  const { account, address, status } = useAccount();
  const isConnected = status === "connected";

  const [teamATeammateAddr, setTeamATeammateAddr] = useState("");
  const [teamBAttackerAddr, setTeamBAttackerAddr] = useState("");
  const [teamBDefenderAddr, setTeamBDefenderAddr] = useState("");
  const [yourRole, setYourRole] = useState<"attacker" | "defender">("attacker");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!account || !teamATeammateAddr || !teamBAttackerAddr || !teamBDefenderAddr) return;

    setLoading(true);
    setError("");

    try {
      const yourAddress = address || account.address;
      const teamAAttacker = yourRole === "attacker" ? yourAddress : teamATeammateAddr;
      const teamADefender = yourRole === "defender" ? yourAddress : teamATeammateAddr;

      const result = await createMatch(
        account,
        teamAAttacker,
        teamADefender,
        teamBAttackerAddr,
        teamBDefenderAddr
      );

      for (let i = 0; i < 6; i++) {
        try {
          const id = await fetchLatestMatchId();
          if (id) {
            setMatchId(id);
            return;
          }
        } catch {
          // Torii may still be syncing after tx confirmation
        }
        await sleep(1200);
      }

      setError(
        `Transaction submitted (${result.transaction_hash}), but Torii has not indexed the new match yet.`
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
        <div className="text-2xl font-bold text-[#00d4ff]">Match Created</div>
        <div className="text-sm text-[#6a6a7a]">Share this with your opponent:</div>
        <div className="bg-[#12121a] border border-[#2a2a3a] rounded p-4 text-sm break-all">
          {matchId}
        </div>
        <Link
          href={`/match/${matchId}`}
          className="inline-block px-6 py-2 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded text-sm"
        >
          GO TO MATCH →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold tracking-wider">CREATE MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to create a match
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">
          Team A Teammate Address (AI)
        </label>
        <input
          type="text"
          value={teamATeammateAddr}
          onChange={(e) => setTeamATeammateAddr(e.target.value)}
          placeholder="0x..."
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Team B Attacker Address</label>
        <input
          type="text"
          value={teamBAttackerAddr}
          onChange={(e) => setTeamBAttackerAddr(e.target.value)}
          placeholder="0x..."
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Team B Defender Address</label>
        <input
          type="text"
          value={teamBDefenderAddr}
          onChange={(e) => setTeamBDefenderAddr(e.target.value)}
          placeholder="0x..."
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
        />
      </div>

      <div className="space-y-3">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Your Role on Team A</label>
        <div className="grid grid-cols-2 gap-4">
          {(["attacker", "defender"] as const).map((role) => (
            <button
              key={role}
              onClick={() => setYourRole(role)}
              className={`p-4 rounded border text-center transition-colors ${
                yourRole === role
                  ? role === "attacker"
                    ? "border-[#ff3344] bg-[#ff3344]/10 text-[#ff3344]"
                    : "border-[#00d4ff] bg-[#00d4ff]/10 text-[#00d4ff]"
                  : "border-[#2a2a3a] bg-[#12121a] text-[#6a6a7a]"
              }`}
            >
              <div className="text-sm font-bold uppercase">{role}</div>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-[#ff3344] text-sm break-all">{error}</div>}

      <button
        onClick={handleCreate}
        disabled={
          !isConnected ||
          !teamATeammateAddr ||
          !teamBAttackerAddr ||
          !teamBDefenderAddr ||
          loading
        }
        className="w-full py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "CREATING..." : "CREATE MATCH"}
      </button>
    </div>
  );
}
