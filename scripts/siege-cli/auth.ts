import { RpcProvider, Account, type AccountInterface } from "starknet";
import { RPC_URL, CHAIN_ID, CONTRACTS } from "./chain.js";

export interface AuthConfig {
  usePrivateKey: boolean;
}

/**
 * Returns an AccountInterface for sending transactions.
 *
 * Two modes:
 * 1. Private key mode: reads DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY from env
 * 2. Cartridge Controller mode: uses SessionProvider from @cartridge/controller/session/node
 */
export async function getAccount(config: AuthConfig): Promise<AccountInterface> {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });

  if (config.usePrivateKey) {
    return getPrivateKeyAccount(provider);
  }

  return getCartridgeAccount(provider);
}

function getPrivateKeyAccount(provider: RpcProvider): AccountInterface {
  const address = process.env.DOJO_ACCOUNT_ADDRESS;
  const pk = process.env.DOJO_PRIVATE_KEY;

  if (!address || !pk) {
    console.error(
      "Error: --use-private-key requires DOJO_ACCOUNT_ADDRESS and DOJO_PRIVATE_KEY env vars"
    );
    process.exit(1);
  }

  return new Account({ provider, address, signer: pk });
}

async function getCartridgeAccount(provider: RpcProvider): Promise<AccountInterface> {
  // Dynamic import so it's not required in private key mode
  const { default: SessionProvider } = await import(
    "@cartridge/controller/session/node"
  );

  const sessionProvider = new SessionProvider({
    rpc: RPC_URL,
    chainId: CHAIN_ID,
    basePath: process.cwd() + "/.cartridge",
    policies: {
      contracts: {
        [CONTRACTS.ACTIONS_1V1]: {
          methods: [
            { name: "Create Match 1v1", entrypoint: "create_match_1v1" },
          ],
        },
        [CONTRACTS.COMMIT_REVEAL_1V1]: {
          methods: [
            { name: "Commit Move", entrypoint: "commit" },
            { name: "Reveal Move", entrypoint: "reveal" },
          ],
        },
      },
    },
  });

  console.log("Connecting to Cartridge Controller...");
  const walletAccount = await sessionProvider.connect();

  if (!walletAccount) {
    console.log(
      "\nNo active session. Please complete authentication in the browser that was opened."
    );
    console.log("After authenticating, re-run this command.");
    process.exit(0);
  }

  console.log(`Connected as: ${walletAccount.address}`);
  return walletAccount;
}
