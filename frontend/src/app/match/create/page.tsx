"use client";

import { useState } from "react";
import { useAccount } from "@/app/providers";
import { createMatch, CONTRACTS } from "@/lib/contracts";
import Link from "next/link";

export default function CreateMatchPage() {
  const { account, isConnected, address, accounts, selectedIndex } = useAccount();
  const otherAccounts = accounts.filter((_, i) => i !== selectedIndex);
  const [teammateAddr, setTeammateAddr] = useState(otherAccounts[0]?.address || "");
  const [yourRole, setYourRole] = useState<"attacker" | "defender">("attacker");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!account || !teammateAddr) return;
    setLoading(true);
    setError("");
    try {
      const attackerAddr = yourRole === "attacker" ? (address || account.address) : teammateAddr;
      const defenderAddr = yourRole === "defender" ? (address || account.address) : teammateAddr;
      const result = await createMatch(account, teammateAddr, attackerAddr, defenderAddr);
      // Try to get match_id from transaction events
      const txHash = result.transaction_hash;
      // Query Torii for the latest match counter to get the real match ID
      const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";
      try {
        const res = await fetch(`${TORII_URL}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `{ siegeMatchCounterModels(first: 1) { edges { node { count } } } }`,
          }),
        });
        const data = await res.json();
        const count = data?.data?.siegeMatchCounterModels?.edges?.[0]?.node?.count;
        if (count != null) {
          setMatchId(String(count));
        } else {
          setMatchId(txHash);
        }
      } catch {
        setMatchId(txHash);
      }
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

      {/* Teammate address */}
      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">
          AI Agent (Teammate)
        </label>
        <select
          value={teammateAddr}
          onChange={(e) => setTeammateAddr(e.target.value)}
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors cursor-pointer"
        >
          {otherAccounts.map((acc, i) => {
            const originalIndex = accounts.findIndex((a) => a.address === acc.address);
            return (
              <option key={acc.address} value={acc.address} className="bg-[#12121a]">
                Dev Account {originalIndex} ({acc.address.slice(0, 6)}…{acc.address.slice(-4)})
              </option>
            );
          })}
        </select>
      </div>

      {/* Role selection */}
      <div className="space-y-3">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">
          Your Role (secret — opponent won&apos;t see this)
        </label>
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
              <div className="text-lg mb-1">{role === "attacker" ? "⚔️" : "🛡️"}</div>
              <div className="text-sm font-bold uppercase">{role}</div>
              <div className="text-xs mt-1">
                {role === "attacker" ? "You breach walls" : "You fortify walls"}
              </div>
            </button>
          ))}
        </div>
        <div className="text-xs text-[#6a6a7a]">
          Your AI agent will take the other role automatically.
        </div>
      </div>

      {/* Team preview */}
      <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
        <div className="text-xs text-[#6a6a7a] tracking-wider uppercase mb-3">Team Preview</div>
        <div className="grid grid-cols-2 gap-4 text-center text-sm">
          <div className="space-y-1">
            <div className="text-[#00d4ff]">YOU</div>
            <div className={yourRole === "attacker" ? "text-[#ff3344]" : "text-[#00d4ff]"}>
              {yourRole === "attacker" ? "⚔️ Attacker" : "🛡️ Defender"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[#ffd700]">YOUR AI</div>
            <div className={yourRole === "attacker" ? "text-[#00d4ff]" : "text-[#ff3344]"}>
              {yourRole === "attacker" ? "🛡️ Defender" : "⚔️ Attacker"}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="text-[#ff3344] text-sm">{error}</div>}

      <button
        onClick={handleCreate}
        disabled={!isConnected || !teammateAddr || loading}
        className="w-full py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "CREATING..." : "CREATE MATCH"}
      </button>
    </div>
  );
}
