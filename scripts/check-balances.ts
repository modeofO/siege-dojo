// Check ERC-20 resource balances for a wallet
// Usage: npx tsx scripts/check-balances.ts <wallet_address>

import { RpcProvider } from "starknet";

const addr = process.argv[2];
if (!addr) {
  console.error("Usage: npx tsx scripts/check-balances.ts 0x<wallet_address>");
  process.exit(1);
}

const p = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });

const tokens: Record<string, string> = {
  IRON:  "0x2154b81255def0de319c2310b38eb54484794e64b54a7a9adce583e4079a77b",
  LINEN: "0x511a65b969eb95a9e510b7809dff5e9c53ac325002423dea0e35ce0a1880f2b",
  STONE: "0x28f46611d132cab82fb0afb6614d95f13dbd20dca76d5d4601fc58acb71552d",
  WOOD:  "0x1014ccf9475d916d5164b44edc0480a2f0cd4e67b5bef6acd22a40c01e83c27",
  EMBER: "0x7e6b21bc243e02e8afac07822d58ec3f8b1c97dedead6849fd96d3026589b4e",
  SEEDS: "0x704234ef94400154669e56ac5a490796b7bf2a277092ea2be46e99eedd03a50",
};

async function main() {
  console.log(`Balances for ${addr}:\n`);
  for (const [name, token] of Object.entries(tokens)) {
    try {
      const r = await p.callContract({ contractAddress: token, entrypoint: "balance_of", calldata: [addr] });
      console.log(`  ${name}: ${Number(r[0])}`);
    } catch {
      console.log(`  ${name}: error`);
    }
  }
}

main();
