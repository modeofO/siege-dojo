"use client";

import type { NodeOwner } from "@/lib/gameState";

interface NodeMapProps {
  nodes: [NodeOwner, NodeOwner, NodeOwner];
}

const NODE_LABELS = ["Node 1", "Node 2", "Node 3"];

const colorMap: Record<NodeOwner, string> = {
  neutral: "bg-[#6a6a7a] border-[#6a6a7a]",
  team1: "bg-[#00d4ff] border-[#00d4ff]",
  team2: "bg-[#ff3344] border-[#ff3344]",
};

const labelMap: Record<NodeOwner, string> = {
  neutral: "Neutral",
  team1: "Yours",
  team2: "Enemy",
};

export function NodeMap({ nodes }: NodeMapProps) {
  return (
    <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a]">
      <div className="text-xs tracking-wider text-[#6a6a7a] uppercase mb-3">Resource Nodes</div>
      <div className="flex justify-around items-center">
        {nodes.map((owner, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className={`w-6 h-6 rounded-full border-2 ${colorMap[owner]} opacity-80`} />
            <span className="text-xs text-[#6a6a7a]">{NODE_LABELS[i]}</span>
            <span className="text-[10px] text-[#6a6a7a]">({labelMap[owner]})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
