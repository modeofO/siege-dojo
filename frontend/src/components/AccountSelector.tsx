"use client";

import { useAccount } from "@/app/providers";

export function AccountSelector() {
  const { address, selectedIndex, setSelectedIndex, accounts } = useAccount();

  return (
    <div className="flex items-center gap-3">
      <select
        value={selectedIndex}
        onChange={(e) => setSelectedIndex(Number(e.target.value))}
        className="bg-[#12121a] border border-[#2a2a3a] rounded px-2 py-1 text-sm text-[#e0e0e8] focus:border-[#00d4ff] focus:outline-none"
      >
        {accounts.map((acc, i) => (
          <option key={i} value={i}>
            Dev Account {i} ({acc.address.slice(0, 6)}...{acc.address.slice(-4)})
          </option>
        ))}
      </select>
      <span className="text-xs text-[#6a6a7a]">
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
    </div>
  );
}
