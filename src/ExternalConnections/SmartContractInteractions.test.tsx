// Unit tests for the contract-write workflows the UI triggers (join the tree,
// give/remove a vote, change name, leave, switch position, move tree vote).
//
// wagmi is mocked: useSimulateContract returns a canned prepared `request`, and
// useWriteContract returns a spy. We assert each workflow (a) prepares the right
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
  AddDagVote,
  ChangeName,
  JoinTree,
  LeaveTree,
  MoveTreeVote,
  RemoveDagVote,
  SwitchWithParent,
} from "./SmartContractInteractions";

// Sentinel object that useSimulateContract hands back as the prepared request;
// the workflow must pass exactly this to writeContract.
const REQUEST = { __preparedRequest: true };

const contract = { address: "0x00000000000000000000000000000000000000c0" };
const account = "0x00000000000000000000000000000000000000aa";
const recipient = "0x00000000000000000000000000000000000000bb";

beforeEach(() => {
  vi.clearAllMocks();
  useSimulateContract.mockReturnValue({ data: { request: REQUEST } });
  useWriteContract.mockReturnValue({ writeContract });
});

describe("JoinTree (join the system)", () => {
  it("prepares joinTree with account, an auto-truncated display name, and the parent", () => {
    const setClickedNodeId = vi.fn();
    const setIsAccountInGraph = vi.fn();

    const join = JoinTree(
      contract,
      account,
      recipient,
      setClickedNodeId,
      setIsAccountInGraph,
    );

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
    join();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("AddDagVote / RemoveDagVote (give and revoke reputation votes)", () => {
  it("AddDagVote prepares addDagVote with weight 1 and submits on invoke", () => {
    const add = AddDagVote(contract, account, recipient);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "addDagVote",
        args: [account, recipient, 1],
      }),
    );
    add();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });

  it("RemoveDagVote prepares removeDagVote(account, recipient)", () => {
    const remove = RemoveDagVote(contract, account, recipient);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "removeDagVote",
        args: [account, recipient],
      }),
    );
    remove();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("ChangeName", () => {
  it("prepares changeName(account, name)", () => {
    const change = ChangeName(contract, account, "Alice");
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "changeName",
        args: [account, "Alice"],
      }),
    );
    change();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("SwitchWithParent (climb the tree)", () => {
  it("prepares switchPositionWithParent(account)", () => {
    const sw = SwitchWithParent(contract, account);
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "switchPositionWithParent",
        args: [account],
      }),
    );
    sw();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
  });
});

describe("LeaveTree", () => {
  it("prepares leaveTree(account) and navigates to the alt node on invoke", () => {
    const setIsAccountInGraph = vi.fn();
    const navigate = vi.fn();
    const setClickedNodeId = vi.fn();
    const altNode = recipient;

    const leave = LeaveTree(
      contract,
      account,
      setIsAccountInGraph,
      navigate,
      setClickedNodeId,
      altNode,
    );
    expect(useSimulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "leaveTree", args: [account] }),
    );

    leave();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
    expect(setClickedNodeId).toHaveBeenCalledWith(altNode);
    expect(navigate).toHaveBeenCalledWith("/?id=" + altNode);
  });
});

describe("MoveTreeVote (move to an unoccupied spot)", () => {
  it("prepares moveTreeVote(account, recipient) and navigates to the new spot", () => {
    const setClickedNodeId = vi.fn();
    const navigate = vi.fn();

    const move = MoveTreeVote(
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

    move();
    expect(writeContract).toHaveBeenCalledWith(REQUEST);
    expect(setClickedNodeId).toHaveBeenCalledWith(recipient);
    expect(navigate).toHaveBeenCalledWith("/?id=" + recipient);
  });
});
