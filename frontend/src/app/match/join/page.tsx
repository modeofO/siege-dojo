"use client";

import { useState } from "react";
import { useAccount } from "@/app/providers";
import { joinMatch } from "@/lib/contracts";
import { useRouter } from "next/navigation";

export default function JoinMatchPage() {
  const { account, isConnected } = useAccount();
  const router = useRouter();
  const [matchId, setMatchId] = useState("");
  const [teammateAddr, setTeammateAddr] = useState("");
  const [yourRole, setYourRole] = useState<"attacker" | "defender">("attacker");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    if (!account || !matchId || !teammateAddr) return;
    setLoading(true);
    setError("");
    try {
      const attackerAddr = yourRole === "attacker" ? account.address : teammateAddr;
      const defenderAddr = yourRole === "defender" ? account.address : teammateAddr;
      await joinMatch(account, matchId, teammateAddr, attackerAddr, defenderAddr);
      router.push(`/match/${matchId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold tracking-wider">JOIN MATCH</h1>

      {!isConnected && (
        <div className="text-[#ff3344] text-sm border border-[#ff3344]/30 rounded p-3 bg-[#ff3344]/5">
          Connect your wallet to join a match
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Match ID</label>
        <input
          type="text"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          placeholder="Paste match ID or invite link"
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">
          Your AI Agent Wallet Address
        </label>
        <input
          type="text"
          value={teammateAddr}
          onChange={(e) => setTeammateAddr(e.target.value)}
          placeholder="0x..."
          className="w-full bg-[#12121a] border border-[#2a2a3a] rounded px-4 py-3 text-sm focus:border-[#00d4ff] focus:outline-none transition-colors"
        />
      </div>

      <div className="space-y-3">
        <label className="text-xs text-[#6a6a7a] tracking-wider uppercase">Your Role</label>
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
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-[#ff3344] text-sm">{error}</div>}

      <button
        onClick={handleJoin}
        disabled={!isConnected || !matchId || !teammateAddr || loading}
        className="w-full py-3 bg-[#00d4ff]/10 border border-[#00d4ff]/40 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition-colors tracking-wider text-sm disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "JOINING..." : "JOIN MATCH"}
      </button>
    </div>
  );
}
