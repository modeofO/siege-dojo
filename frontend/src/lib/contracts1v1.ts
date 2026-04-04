import type { AccountInterface, UniversalDetails } from "starknet";

const IS_DEVNET = (process.env.NEXT_PUBLIC_NETWORK || "devnet") === "devnet";

export const VRF_PROVIDER_ADDRESS = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

export const CONTRACTS_1V1 = {
  ACTIONS: process.env.NEXT_PUBLIC_ACTIONS_1V1_ADDRESS || "0x7cbd822e0dc535d084dd71b76ba332d76cb370954c83a5ebe5625f36cdfa1c",
  COMMIT_REVEAL: process.env.NEXT_PUBLIC_COMMIT_REVEAL_1V1_ADDRESS || "0x516bdf650dcaebe431a06fba09766ee2d4be79c477e73ba220a64c4f6d4af80",
  RESOLUTION: process.env.NEXT_PUBLIC_RESOLUTION_1V1_ADDRESS || "0x1b31a6098f1b9081e925e98cd9627c6a5cce39073e92c3f5bf827cb09abe36b",
};

const DEVNET_TX_OPTS: UniversalDetails = {
  skipValidate: true,
  resourceBounds: {
    l1_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l2_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
    l1_data_gas: { max_amount: BigInt(0), max_price_per_unit: BigInt(0) },
  },
};

const TX_OPTS = IS_DEVNET ? DEVNET_TX_OPTS : undefined;

// Source::Nonce(address) encoded for calldata: type=0, then the address
function vrfRequestRandomCall(callerContract: string, signerAddress: string) {
  return {
    contractAddress: VRF_PROVIDER_ADDRESS,
    entrypoint: "request_random",
    calldata: [callerContract, "0", signerAddress],  // caller, Source::Nonce variant (0), address
  };
}

export async function createMatch1v1(
  account: AccountInterface,
  playerA: string,
  playerB: string,
) {
  return account.execute(
    [
      vrfRequestRandomCall(CONTRACTS_1V1.ACTIONS, account.address),
      {
        contractAddress: CONTRACTS_1V1.ACTIONS,
        entrypoint: "create_match_1v1",
        calldata: [playerA, playerB],
      },
    ],
    TX_OPTS,
  );
}

export async function commitMove1v1(
  account: AccountInterface,
  matchId: string,
  commitment: string,
) {
  return account.execute(
    {
      contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
      entrypoint: "commit",
      calldata: [matchId, commitment],
    },
    TX_OPTS,
  );
}

export async function revealMove1v1(
  account: AccountInterface,
  matchId: string,
  salt: string,
  p0: string, p1: string, p2: string,
  g0: string, g1: string, g2: string,
  repair: string,
  nc0: string, nc1: string, nc2: string,
) {
  // Always include request_random — harmless if not consumed (1st reveal),
  // required when this is the 2nd reveal (triggers resolution which consumes it)
  return account.execute(
    [
      vrfRequestRandomCall(CONTRACTS_1V1.RESOLUTION, account.address),
      {
        contractAddress: CONTRACTS_1V1.COMMIT_REVEAL,
        entrypoint: "reveal",
        calldata: [matchId, salt, p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2],
      },
    ],
    TX_OPTS,
  );
}
