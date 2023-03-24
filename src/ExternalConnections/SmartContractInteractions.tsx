// import { serveParent } from "../Graph/LoadGraph";

export async function AddDagVote(AnthillContract:any,  account: string, recipient:string){
    await AnthillContract.addDagVote(account, recipient, 1).then((res:any)=>{console.log(res)});
  }
  
export async function RemoveDagVote(AnthillContract:any,  account: string, recipient:string){
    await AnthillContract.removeDagVote(account, recipient).then((res:any)=>{console.log(res)});
  }
  
  export   async function SwitchWithParent(AnthillContract:any,   account: string){
    await AnthillContract.switchPositionWithParent(account).then((res:any)=>{console.log(res)});
  }
  
  export async function JoinTree(AnthillContract:any,  account: string, recipient:string, setClickedNodeId:any){
    await AnthillContract.joinTree(account, account.slice(0, 3)+"..."+account.slice(-3), recipient).then((res:any)=>{ setClickedNodeId(account); console.log(res)});
  }
  
  export   async function ChangeName(AnthillContract:any,  account: string, name: string){
    await AnthillContract.changeName(account, name).then((res:any)=>{console.log(res)});
  }
  
  export   async function LeaveTree(AnthillContract:any,  account: string, setIsAccountInGraph: any, navigate: any, setClickedNodeId:any, altNode:string){
    
    await AnthillContract.leaveTree(account).then((res:any)=>{
      console.log(res);
      setIsAccountInGraph(false);
      setClickedNodeId(altNode);
      // console.log("parent", parent);
      navigate("/?id="+altNode);
    });
  }
  
  export   async function MoveTreeVote(AnthillContract:any,  account: string, recipient:string, setClickedNodeId:any, navigate:any){
    await AnthillContract.moveTreeVote(account, recipient).then((res:any)=>{
        setClickedNodeId(recipient);
        navigate("/?id="+recipient);
        console.log(res)});
  }