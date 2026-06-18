// Custom hooks wrapping the Anthill contract writes. Each prepares the call
// with useSimulateContract and returns an action that submits the prepared
// request — or `undefined` while the simulation isn't ready (callers invoke
// with `?.()`), so we never dereference an unprepared request.
import { useSimulateContract, useWriteContract } from "wagmi";
import AnthillJson from "./Anthill.json";

export function useAddDagVote(
  AnthillContract: any,
  account: string,
  recipient: string,
) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "addDagVote",
    args: [account, recipient, 1],
  });
  const { writeContract } = useWriteContract();
  return data ? () => writeContract(data.request) : undefined;
}

export function useRemoveDagVote(
  AnthillContract: any,
  account: string,
  recipient: string,
) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "removeDagVote",
    args: [account, recipient],
  });
  const { writeContract } = useWriteContract();
  return data ? () => writeContract(data.request) : undefined;
}

export function useSwitchWithParent(AnthillContract: any, account: string) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "switchPositionWithParent",
    args: [account],
  });
  const { writeContract } = useWriteContract();
  return data ? () => writeContract(data.request) : undefined;
}

export function useJoinTree(
  AnthillContract: any,
  account: string,
  recipient: string,
) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "joinTree",
    args: [
      account,
      account?.slice(0, 3) + "..." + account?.slice(-3),
      recipient,
    ],
  });
  const { writeContract } = useWriteContract();
  return data ? () => writeContract(data.request) : undefined;
}

export function useChangeName(
  AnthillContract: any,
  account: string,
  name: string,
) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "changeName",
    args: [account, name],
  });
  const { writeContract } = useWriteContract();
  return data ? () => writeContract(data.request) : undefined;
}

export function useLeaveTree(
  AnthillContract: any,
  account: string,
  navigate: any,
  setClickedNodeId: any,
  altNode: string,
) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "leaveTree",
    args: [account],
  });
  const { writeContract } = useWriteContract();
  return data
    ? () => {
        writeContract(data.request);
        setClickedNodeId(altNode);
        navigate("/?id=" + altNode);
      }
    : undefined;
}

export function useMoveTreeVote(
  AnthillContract: any,
  account: string,
  recipient: string,
  setClickedNodeId: any,
  navigate: any,
) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "moveTreeVote",
    args: [account, recipient],
  });
  const { writeContract } = useWriteContract();
  return data
    ? () => {
        writeContract(data.request);
        setClickedNodeId(recipient);
        navigate("/?id=" + recipient);
      }
    : undefined;
}
