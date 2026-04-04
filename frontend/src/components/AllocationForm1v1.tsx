// frontend/src/components/AllocationForm1v1.tsx
"use client";

interface AllocationForm1v1Props {
  budget: number;
  allocations: number[];
  onChange: (allocations: number[]) => void;
}

const LABELS = [
  // Attack (indices 0-2)
  "Attack: East Gate",
  "Attack: West Gate",
  "Attack: Underground",
  // Defense (indices 3-5)
  "Defend: East Gate",
  "Defend: West Gate",
  "Defend: Underground",
  // Repair (index 6)
  "Repair",
  // Nodes (indices 7-9)
  "Node 1",
  "Node 2",
  "Node 3",
];

const SECTION_BREAKS: Record<number, string> = {
  0: "ATTACK",
  3: "DEFENSE",
  6: "SUPPORT",
  7: "NODES",
};

export function AllocationForm1v1({ budget, allocations, onChange }: AllocationForm1v1Props) {
  const total = allocations.reduce((a, b) => a + b, 0);
  const remaining = budget - total;

  const handleChange = (index: number, value: number) => {
    const clamped = Math.max(0, value);
    const newAlloc = [...allocations];
    newAlloc[index] = clamped;
    const newTotal = newAlloc.reduce((a, b) => a + b, 0);
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

      {LABELS.map((label, i) => (
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

      <div className="flex justify-between text-xs text-[#6a6a7a] pt-2 border-t border-[#2a2a3a]">
        <span>Total: {total} / {budget}</span>
        {remaining !== 0 && (
          <span className="text-[#ffd700]">Must allocate exactly {budget}</span>
        )}
      </div>
    </div>
  );
}
