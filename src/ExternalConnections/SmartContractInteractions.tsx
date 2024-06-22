// import { serveParent } from "../Graph/LoadGraph";
import { useWriteContract, useSimulateContract } from "wagmi";
import AnthillJson from "./Anthill.json";

export function AddDagVote(
  AnthillContract: any,
  account: string,
  recipient: string,
): any {
  const { data, error } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "addDagVote",
    args: [account, recipient, 1],
  });
  const { writeContract } = useWriteContract();

  return writeContract(data!.request);
  // return ()=>{}

  // then((res:any)=>{console.log(res)});

  // await AnthillContract.addDagVote(account, recipient, 1).then((res:any)=>{console.log(res)});
}

export function RemoveDagVote(
  AnthillContract: any,
  account: string,
  recipient: string,
) {
  // await AnthillContract.removeDagVote(account, recipient).then((res:any)=>{console.log(res)});

  const { data, error } = useSimulateContract({
    address: AnthillContract.address,
    abi: AnthillJson.abi,
    functionName: "removeDagVote",
    args: [account, recipient],
  });
  const { writeContract } = useWriteContract();

  return () => {
    writeContract(data!.request);
  };
  // return ()=>{}
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
  // return ()=>{}

  // await AnthillContract.switchPositionWithParent(account).then((res:any)=>{console.log(res)});
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

  return () => {
    writeContract(data!.request);
  };
  // return ()=>{}

  // await AnthillContract.joinTree(account, account.slice(0, 3)+"..."+account.slice(-3), recipient).then((res:any)=>{ setClickedNodeId(account); console.log(res)});
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
  // return ()=>{}

  // await AnthillContract.changeName(account, name).then((res:any)=>{console.log(res)});
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

  return () => {
    writeContract(data!.request);
    setClickedNodeId(altNode);
    navigate("/?id=" + altNode);
  };

  // return ()=>{}

  // await AnthillContract.leaveTree(account).then((res:any)=>{
  //   console.log(res);
  //   setIsAccountInGraph(false);
  //   setClickedNodeId(altNode);
  //   // console.log("parent", parent);
  //   navigate("/?id="+altNode);
  // });
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
  // return ()=>{}

  // await AnthillContract.moveTreeVote(account, recipient).then((res:any)=>{
  //     setClickedNodeId(recipient);
  //     navigate("/?id="+recipient);
  //     console.log(res)});
}
