import { serveParent } from "../Graph/GraphCore/LoadGraph";

export async function AddDagVote(AnthillContract:any, chainId: number, account: string, recipient:string){
    await AnthillContract.methods.addDagVote(account, recipient, 1).send({from: account, chainId: chainId}).then((res:any)=>{console.log(res)});
  }
  
export async function RemoveDagVote(AnthillContract:any, chainId: number, account: string, recipient:string){
    await AnthillContract.methods.removeDagVote(account, recipient).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});
  }
  
  export   async function SwitchWithParent(AnthillContract:any,  chainId: number, account: string){
    await AnthillContract.methods.switchPositionWithParent(account).send({from: account, chainId: chainId}).then((res:any)=>{console.log(res)});
  }
  
  export async function JoinTree(AnthillContract:any, chainId: number, account: string, recipient:string, setClickedNodeId:any){
    await AnthillContract.methods.joinTree(account, account.slice(0, 3)+"..."+account.slice(-3), recipient).send({from:account  , chainId: chainId}).then((res:any)=>{ setClickedNodeId(account); console.log(res)});
  }
  
  export   async function ChangeName(AnthillContract:any, chainId: number, account: string, name: string){
    await AnthillContract.methods.changeName(account, name).send({from:account  , chainId: chainId}).then((res:any)=>{console.log(res)});
  }
  
  export   async function LeaveTree(AnthillContract:any, chainId: number, account: string, setIsAccountInGraph: any, navigate: any, setClickedNodeId:any){
    
    await AnthillContract.methods.leaveTree(account).send({from: account, chainId: chainId}).then((res:any)=>{
      console.log(res);
      setIsAccountInGraph(false);
      var parent = serveParent(account);
      setClickedNodeId(parent);
      // console.log("parent", parent);
      navigate("/?id="+parent);
    });
  }
  
  export   async function MoveTreeVote(AnthillContract:any, chainId: number, account: string, recipient:string, setClickedNodeId:any, navigate:any){
    await AnthillContract.methods.moveTreeVote(account, recipient).send({from: account, chainId: chainId}).then((res:any)=>{
        setClickedNodeId(recipient);
        navigate("/?id="+recipient);
        console.log(res)});
  }