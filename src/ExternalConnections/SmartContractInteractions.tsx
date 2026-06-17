import { useSimulateContract, useWriteContract } from "wagmi";
import AnthillJson from "./Anthill.json";

export function AddDagVote(
  AnthillContract: any,
  account: string,
  recipient: string,
): any {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "addDagVote",
    args: [account, recipient, 1],
  });
  const { writeContract } = useWriteContract();
  return () => {
    writeContract(data!.request);
  };
}

export function RemoveDagVote(
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

  return () => {
    writeContract(data!.request);
  };
}

export function SwitchWithParent(AnthillContract: any, account: string) {
  const { data } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "switchPositionWithParent",
    args: [account],
  });
  const { writeContract } = useWriteContract();

  return () => {
    writeContract(data!.request);
  };
}

export function JoinTree(
  AnthillContract: any,
  account: string,
  recipient: string,
  setClickedNodeId: any,
  setIsAccountInGraph: any,
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
  console.log(setClickedNodeId, setIsAccountInGraph);
  return () => {
    writeContract(data!.request);
  };
}

export function ChangeName(
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

  return () => {
    writeContract(data!.request);
  };
}

export function LeaveTree(
  AnthillContract: any,
  account: string,
  setIsAccountInGraph: any,
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
  console.log(setIsAccountInGraph);
  return () => {
    writeContract(data!.request);
    setClickedNodeId(altNode);
    navigate("/?id=" + altNode);
  };
}

export function MoveTreeVote(
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

  return () => {
    writeContract(data!.request);
    setClickedNodeId(recipient);
    navigate("/?id=" + recipient);
  };
}
