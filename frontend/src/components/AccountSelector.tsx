"use client";

import { useAccount } from "@/app/providers";

export function AccountSelector() {
  const { selectedIndex, setSelectedIndex, accounts } = useAccount();

  return (
    <select
      value={selectedIndex}
      onChange={(e) => setSelectedIndex(Number(e.target.value))}
      className="text-xs px-3 py-1.5 bg-[#12121a] border border-[#2a2a3a] rounded text-[#e0e0e8] focus:border-[#00d4ff] focus:outline-none cursor-pointer"
    >
      {accounts.map((acc, i) => (
        <option key={i} value={i} className="bg-[#12121a]">
          Dev Account {i} ({acc.address.slice(0, 6)}…{acc.address.slice(-4)})
        </option>
      ))}
    </select>
  );
}
