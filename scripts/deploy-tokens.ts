// Deploy 6 ERC-20 resource token contracts to Sepolia
// Usage: DOJO_ACCOUNT_ADDRESS=0x... DOJO_PRIVATE_KEY=0x... npx tsx scripts/deploy-tokens.ts
//
// Prerequisites: Run `sozo build -P sepolia` first

import { Account, RpcProvider, CallData, hash, json, byteArray } from "starknet";
import { readFileSync } from "fs";

const RPC = "https://api.cartridge.gg/x/starknet/sepolia";
const MINTER = "0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b"; // resolution_1v1

const ACCOUNT_ADDRESS = process.env.DOJO_ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.DOJO_PRIVATE_KEY;

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Set DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY");
  process.exit(1);
}

console.log("Step 1: Connecting to RPC...");
console.log("  RPC:", RPC);
console.log("  Account:", ACCOUNT_ADDRESS);
const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });
console.log("  Connected.");

// Read the compiled Sierra contract
console.log("Step 2: Reading contract artifact...");
const raw = readFileSync("target/sepolia/siege_dojo_ResourceToken.contract_class.json", "utf-8");
console.log("  File read, size:", raw.length, "bytes");
const contractArtifact = json.parse(raw);
console.log("  Parsed.");

// Compute class hash from Sierra
console.log("Step 3: Computing class hash (this may take a moment)...");
const classHash = hash.computeSierraContractClassHash(contractArtifact);
console.log("  Class hash:", classHash);

const TOKENS = [
  { name: "Iron", symbol: "IRON" },
  { name: "Linen", symbol: "LINEN" },
  { name: "Stone", symbol: "STONE" },
  { name: "Wood", symbol: "WOOD" },
  { name: "Ember", symbol: "EMBER" },
  { name: "Seeds", symbol: "SEEDS" },
];

async function main() {
  // Check if class is already declared
  console.log("\nChecking if class is declared...");
  try {
    await provider.getClassByHash(classHash);
    console.log("Class already declared on-chain.");
  } catch {
    console.error("Class NOT declared on-chain. You need to declare it first.");
    console.error("Use: /tmp/sozo -P sepolia execute --declare target/sepolia/siege_dojo_ResourceToken.contract_class.json");
    console.error("Or manually declare via starkli.");
    process.exit(1);
  }

  const addresses: string[] = [];

  for (const token of TOKENS) {
    console.log(`\nDeploying ${token.name} (${token.symbol})...`);

    // Use UDC (Universal Deployer Contract) via account.deploy
    // ByteArray args need explicit encoding via byteArray.byteArrayFromString
    const constructorCalldata = [
      ...CallData.compile(byteArray.byteArrayFromString(token.name)),
      ...CallData.compile(byteArray.byteArrayFromString(token.symbol)),
      MINTER,
    ];

    const deployResult = await account.deploy({
      classHash,
      constructorCalldata,
      salt: hash.computePoseidonHash(classHash, "0x" + Buffer.from(token.symbol).toString("hex")),
    });

    console.log(`  tx: ${deployResult.transaction_hash}`);
    await provider.waitForTransaction(deployResult.transaction_hash);

    // Extract deployed address
    const addr = Array.isArray(deployResult.contract_address)
      ? deployResult.contract_address[0]
      : deployResult.contract_address;
    console.log(`  ${token.name}: ${addr}`);
    addresses.push(addr as string);
  }

  console.log("\n=== All tokens deployed ===");
  TOKENS.forEach((t, i) => console.log(`  ${t.symbol}: ${addresses[i]}`));

  // Set resource config
  console.log("\n=== Setting resource config ===");
  const ACTIONS_1V1 = "0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c";

  const tx = await account.execute({
    contractAddress: ACTIONS_1V1,
    entrypoint: "set_resource_config",
    calldata: CallData.compile([
      addresses[0], // iron
      addresses[1], // linen
      addresses[2], // stone
      addresses[3], // wood
      addresses[4], // ember
      addresses[5], // seeds
    ]),
  });
  console.log("  set_resource_config tx:", tx.transaction_hash);
  await provider.waitForTransaction(tx.transaction_hash);
  console.log("  Done!");

  console.log("\n=== Summary ===");
  console.log("Token addresses (save these):");
  TOKENS.forEach((t, i) => console.log(`  ${t.symbol}: ${addresses[i]}`));
}

main().catch((e) => {
  console.error("\nDeployment failed:", e.message || e);
  process.exit(1);
});
