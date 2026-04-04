// frontend/src/components/AllocationForm1v1.tsx
"use client";

import type { NodeOwner } from "@/lib/gameState1v1";

interface AllocationForm1v1Props {
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
  nodes: [NodeOwner, NodeOwner, NodeOwner];
  isPlayerA: boolean;
}

const GATE_LABELS = [
  "Attack: East Gate",
  "Attack: West Gate",
  "Attack: Underground",
  "Defend: East Gate",
  "Defend: West Gate",
  "Defend: Underground",
  "Repair",
];

const NODE_LABELS = ["Node 1", "Node 2", "Node 3"];

const SECTION_BREAKS: Record<number, string> = {
  0: "ATTACK",
  3: "DEFENSE",
  6: "SUPPORT",
};

export function AllocationForm1v1({ budget, allocations, onChange, nodes, isPlayerA }: AllocationForm1v1Props) {
  const trapCost = ((allocations[10] || 0) + (allocations[11] || 0) + (allocations[12] || 0)) * 2;
  const allocationTotal = allocations.slice(0, 10).reduce((a, b) => a + b, 0);
  const total = allocationTotal + trapCost;
  const remaining = budget - total;

  const myTeam: NodeOwner = isPlayerA ? "teamA" : "teamB";

  const handleChange = (index: number, value: number) => {
    const clamped = Math.max(0, value);
    const newAlloc = [...allocations];
    newAlloc[index] = clamped;
    const newTrapCost = ((newAlloc[10] || 0) + (newAlloc[11] || 0) + (newAlloc[12] || 0)) * 2;
    const newTotal = newAlloc.slice(0, 10).reduce((a, b) => a + b, 0) + newTrapCost;
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  const handleTrapToggle = (nodeIndex: number) => {
    const trapIdx = 10 + nodeIndex;
    const newAlloc = [...allocations];
    if (newAlloc[trapIdx] === 1) {
      // Untrap
      newAlloc[trapIdx] = 0;
    } else {
      // Trap — also zero out the node contest
      newAlloc[trapIdx] = 1;
      newAlloc[7 + nodeIndex] = 0;
    }
    const newTrapCost = ((newAlloc[10] || 0) + (newAlloc[11] || 0) + (newAlloc[12] || 0)) * 2;
    const newTotal = newAlloc.slice(0, 10).reduce((a, b) => a + b, 0) + newTrapCost;
    if (newTotal <= budget) {
      onChange(newAlloc);
    }
  };

  return (
    <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#12121a] space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs tracking-wider text-[#6a6a7a] uppercase">
          Allocate Your Budget
        </span>
        <span className={`text-sm font-bold ${remaining === 0 ? "text-green-400" : remaining < 0 ? "text-red-400" : "text-[#ffd700]"}`}>
          Remaining: {remaining}
        </span>
      </div>

      {/* Attack, Defense, Repair (indices 0-6) */}
      {GATE_LABELS.map((label, i) => (
        <div key={label}>
          {SECTION_BREAKS[i] && (
            <div className="text-[10px] tracking-wider text-[#6a6a7a] uppercase mt-2 mb-1 border-t border-[#2a2a3a] pt-2">
              {SECTION_BREAKS[i]}
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#6a6a7a] w-32 truncate">{label}</span>
            <input
              type="range"
              min={0}
              max={budget}
              value={allocations[i] || 0}
              onChange={(e) => handleChange(i, parseInt(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min={0}
              max={budget}
              value={allocations[i] || 0}
              onChange={(e) => handleChange(i, Math.max(0, parseInt(e.target.value) || 0))}
              className="w-12 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-1"
            />
          </div>
        </div>
      ))}

      {/* Nodes (indices 7-9) with trap toggles (indices 10-12) */}
      <div className="text-[10px] tracking-wider text-[#6a6a7a] uppercase mt-2 mb-1 border-t border-[#2a2a3a] pt-2">
        NODES
      </div>
      {NODE_LABELS.map((label, ni) => {
        const nodeIdx = 7 + ni;
        const trapIdx = 10 + ni;
        const isTrapped = allocations[trapIdx] === 1;
        const canTrap = nodes[ni] === myTeam;

        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#6a6a7a] w-32 truncate">{label}</span>
              {isTrapped ? (
                <div className="flex-1 text-center text-xs text-[#ff3344]">TRAPPED (cost: 2)</div>
              ) : (
                <>
                  <input
                    type="range"
                    min={0}
                    max={budget}
                    value={allocations[nodeIdx] || 0}
                    onChange={(e) => handleChange(nodeIdx, parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={budget}
                    value={allocations[nodeIdx] || 0}
                    onChange={(e) => handleChange(nodeIdx, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-12 text-center bg-[#1a1a26] border border-[#2a2a3a] rounded text-sm py-1"
                  />
                </>
              )}
              {canTrap && (
                <button
                  onClick={() => handleTrapToggle(ni)}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    isTrapped
                      ? "border-[#ff3344] bg-[#ff3344]/20 text-[#ff3344]"
                      : "border-[#2a2a3a] text-[#6a6a7a] hover:border-[#ff3344] hover:text-[#ff3344]"
                  }`}
                >
                  {isTrapped ? "DISARM" : "TRAP"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-between text-xs text-[#6a6a7a] pt-2 border-t border-[#2a2a3a]">
        <span>
          Points: {allocationTotal} + Traps: {trapCost} = {total} / {budget}
        </span>
        {remaining !== 0 && (
          <span className="text-[#ffd700]">Must allocate exactly {budget}</span>
        )}
      </div>
    </div>
  );
}
