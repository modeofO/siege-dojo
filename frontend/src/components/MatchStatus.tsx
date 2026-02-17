"use client";

interface MatchStatusProps {
  phase: "committing" | "revealing" | "resolving" | "finished";
  round: number;
  budget: number;
}

const phaseConfig = {
  committing: { label: "COMMITTING", color: "text-[#ffd700]", icon: "◉" },
  revealing: { label: "REVEALING", color: "text-[#00d4ff]", icon: "◎" },
  resolving: { label: "RESOLVING", color: "text-[#6a6a7a]", icon: "⟳" },
  finished: { label: "FINISHED", color: "text-[#ff3344]", icon: "■" },
};

export function MatchStatus({ phase, round, budget }: MatchStatusProps) {
  const config = phaseConfig[phase];

  return (
    <div className="flex items-center justify-between border border-[#2a2a3a] rounded-lg p-3 bg-[#12121a]">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold">ROUND {round}</span>
        <span className={`text-xs tracking-wider ${config.color}`}>
          {config.icon} {config.label}
        </span>
      </div>
      <div className="text-sm">
        Budget: <span className="text-[#ffd700] font-bold">{budget}</span>
      </div>
    </div>
  );
}
