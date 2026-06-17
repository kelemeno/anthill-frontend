// @vitest-environment node
//
// End-to-end "can we join the system?" test against a real anvil node.
//
// It deploys a FRESH Anthill contract (so it never touches the dev stack's
// seeded instance), then drives the core on-chain join workflow with viem:
//   1. joinTreeAsRoot  -> the first member becomes the tree root
//   2. joinTree        -> a second member joins underneath the root
// and verifies the resulting on-chain tree structure (root, names, depths,
// tree-vote links).
//
// Requires anvil running on http://localhost:8545 (chain 1337) AND the Foundry
// build artifact (run `forge build` in anthill-contracts). If anvil is not
// reachable the whole suite is skipped rather than failing, so `npm test`
// stays green in environments without a chain.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";

const RPC_URL = "http://localhost:8545";

// anvil's first prefunded dev account (well-known default key).
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const anvilChain = {
  id: 1337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

// Tree members are addressed by tiny sentinel addresses, mirroring the deploy script.
const ROOT: Address = "0x0000000000000000000000000000000000000002";
const CHILD: Address = "0x0000000000000000000000000000000000000004";

// Load the freshly built Anthill artifact (ABI + bytecode) from the contracts repo.
const artifactPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../anthill-contracts/out/Anthill.sol/Anthill.json",
);

let artifact: { abi: any[]; bytecode: { object: Hex } } | null = null;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch {
  artifact = null;
}

async function anvilReachable(): Promise<boolean> {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const ready = (await anvilReachable()) && artifact !== null;
const describeIf = ready ? describe : describe.skip;

if (!ready) {
  // eslint-disable-next-line no-console
  console.warn(
    `[joinSystem.integration] skipped — anvil reachable: ${await anvilReachable()}, artifact present: ${artifact !== null} (run anvil + 'forge build' to enable).`,
  );
}

describeIf("joining the Anthill on-chain", () => {
  const abi = artifact!.abi;
  const publicClient = createPublicClient({
    chain: anvilChain,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: anvilChain,
    transport: http(RPC_URL),
  });

  let address: Address;

  beforeAll(async () => {
    const hash = await walletClient.deployContract({
      abi,
      bytecode: artifact!.bytecode.object,
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.contractAddress).toBeTruthy();
    address = receipt.contractAddress as Address;
  });

  async function send(functionName: string, args: unknown[]) {
    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  }

  function read<T = unknown>(functionName: string, args: unknown[] = []) {
    return publicClient.readContract({
      address,
      abi,
      functionName,
      args,
    }) as Promise<T>;
  }

  const sameAddr = (a: string, b: string) =>
    a.toLowerCase() === b.toLowerCase();

  it("starts out empty (no root)", async () => {
    const root = await read<Address>("root");
    expect(sameAddr(root, "0x0000000000000000000000000000000000000000")).toBe(
      true,
    );
  });

  it("lets the first member join as the tree root", async () => {
    await send("joinTreeAsRoot", [ROOT, "Root2"]);

    expect(sameAddr(await read<Address>("root"), ROOT)).toBe(true);
    expect(await read<string>("nameOf", [ROOT])).toBe("Root2");
    expect(await read<bigint>("readDepth", [ROOT])).toBe(0n);
  });

  it("lets a second member join underneath the root", async () => {
    await send("joinTree", [CHILD, "Node4", ROOT]);

    // The child's tree vote points up at the root...
    expect(sameAddr(await read<Address>("sentTreeVote", [CHILD]), ROOT)).toBe(
      true,
    );
    // ...and the root lists the child as its first received tree vote.
    expect(
      sameAddr(await read<Address>("recTreeVote", [ROOT, 0n]), CHILD),
    ).toBe(true);
    // The child sits one level below the root.
    expect(await read<bigint>("readDepth", [CHILD])).toBe(1n);
    expect(await read<string>("nameOf", [CHILD])).toBe("Node4");
  });
});
