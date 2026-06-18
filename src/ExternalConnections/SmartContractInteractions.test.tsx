// Unit tests for the contract-write workflows the UI triggers (join the tree,
// give/remove a vote, change name, leave, switch position, move tree vote).
//
// wagmi is mocked: useSimulateContract returns a canned prepared `request`, and
// useWriteContract returns a spy. We assert each hook (a) prepares the right
// contract call (functionName + args) and (b) submits that prepared request when
// the returned action is invoked — plus any navigation/state side effects.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSimulateContract, useWriteContract, writeContract } = vi.hoisted(
  () => {
    const writeContract = vi.fn();
    return {
      writeContract,
      useSimulateContract: vi.fn(),
      useWriteContract: vi.fn(() => ({ writeContract })),
    };
  },
);

vi.mock("wagmi", () => ({ useSimulateContract, useWriteContract }));

import {
  useAddDagVote,
  useChangeName,
  useJoinTree,
  useLeaveTree,
  useMoveTreeVote,
  useRemoveDagVote,
  useSwitchWithParent,
} from "./SmartContractInteractions";

// Sentinel object that useSimulateContract hands back as the prepared request;
// the action must pass exactly this to writeContract.
const REQUEST = { __preparedRequest: true };

const contract = { address: "0x00000000000000000000000000000000000000c0" };
const account = "0x00000000000000000000000000000000000000aa";
const recipient = "0x00000000000000000000000000000000000000bb";

beforeEach(() => {
  vi.clearAllMocks();
  useSimulateContract.mockReturnValue({ data: { request: REQUEST } });
  useWriteContract.mockReturnValue({ writeContract });
});

describe("useJoinTree (join the system)", () => {
  it("prepares joinTree with account, an auto-truncated display name, and the parent", () => {
    const join = useJoinTree(contract, account, recipient);

    const expectedName = account.slice(0, 3) + "..." + account.slice(-3);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: contract.address,
        functionName: "joinTree",
        args: [account, expectedName, recipient],
      }),
    );

    // Nothing is written until the user invokes the action.
    expect(writeContract).not.toHaveBeenCalled();
    join?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });

  it("returns undefined while the simulation is not ready (no crash)", () => {
    useSimulateContract.mockReturnValue({ data: undefined });
    const join = useJoinTree(contract, account, recipient);
    expect(join).toBeUndefined();
  });
});

describe("useAddDagVote / useRemoveDagVote (give and revoke reputation votes)", () => {
  it("useAddDagVote prepares addDagVote with weight 1 and submits on invoke", () => {
    const add = useAddDagVote(contract, account, recipient);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "addDagVote",
        args: [account, recipient, 1],
      }),
    );
    add?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });

  it("useRemoveDagVote prepares removeDagVote(account, recipient)", () => {
    const remove = useRemoveDagVote(contract, account, recipient);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "removeDagVote",
        args: [account, recipient],
      }),
    );
    remove?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("useChangeName", () => {
  it("prepares changeName(account, name)", () => {
    const change = useChangeName(contract, account, "Alice");
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "changeName",
        args: [account, "Alice"],
      }),
    );
    change?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("useSwitchWithParent (climb the tree)", () => {
  it("prepares switchPositionWithParent(account)", () => {
    const sw = useSwitchWithParent(contract, account);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "switchPositionWithParent",
        args: [account],
      }),
    );
    sw?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("useLeaveTree", () => {
  it("prepares leaveTree(account) and navigates to the alt node on invoke", () => {
    const navigate = vi.fn();
    const setClickedNodeId = vi.fn();
    const altNode = recipient;

    const leave = useLeaveTree(
      contract,
      account,
      navigate,
      setClickedNodeId,
      altNode,
    );
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "leaveTree", args: [account] }),
    );

    leave?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
    expect(setClickedNodeId).toHaveBeenCalledWith(altNode);
    expect(navigate).toHaveBeenCalledWith("/?id=" + altNode);
  });
});

describe("useMoveTreeVote (move to an unoccupied spot)", () => {
  it("prepares moveTreeVote(account, recipient) and navigates to the new spot", () => {
    const setClickedNodeId = vi.fn();
    const navigate = vi.fn();

    const move = useMoveTreeVote(
      contract,
      account,
      recipient,
      setClickedNodeId,
      navigate,
    );
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "moveTreeVote",
        args: [account, recipient],
      }),
    );

    move?.();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
    expect(setClickedNodeId).toHaveBeenCalledWith(recipient);
    expect(navigate).toHaveBeenCalledWith("/?id=" + recipient);
  });
});
