import React, {useState} from 'react';
import Popover from '@mui/material/Popover';
import { useAccount, useSigner, useProvider} from 'wagmi'
import { usePrepareContractWrite, useContractWrite } from 'wagmi'
import {  QueryClientProvider, QueryClient } from '@tanstack/react-query'




import './App.css';
import {GraphData, getNeighbourhood, GraphDataToArray, getRootNode, NodeData, findDepthDiff, checkDagVote} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';


const DagVoteButton = (props :any)=>{
  var [isLocal, ] = findDepthDiff(props.voter, props.recipient)
  const { address, isConnected } = useAccount()
  // const signer =  useSigner();
  const provider = useProvider();

  const { config : addConfig} = usePrepareContractWrite({
    address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
    abi: [
      {
        name: 'mint',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ internalType: 'uint32', name: 'tokenId', type: 'uint32' }],
        outputs: [],
      },
    ],
    functionName: 'mint',
    args: [69],
  })
  const { data:addData, isLoading:addIsLoading, isSuccess: addisSuccess, write: addWrite } = useContractWrite(addConfig)

  const { config : removeConfig} = usePrepareContractWrite({
    address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
    abi: [
      {
        name: 'mint',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ internalType: 'uint32', name: 'tokenId', type: 'uint32' }],
        outputs: [],
      },
    ],
    functionName: 'mint',
    args: [69],
  })
  const { data:removeData, isLoading:removeIsLoading, isSuccess: removeisSuccess, write: removeWrite } = useContractWrite(removeConfig)

  if (isLocal) {
    if (checkDagVote(props.voter, props.recipient)) {
     
      return (<button disabled={!removeWrite} onClick={() => removeWrite?.()}>Remove Dag Vote</button>)
    } 
    else {
      


      return (<button disabled={!addWrite} onClick={() => addWrite?.()}>Add Dag Vote</button>)
    }
  }
  return  <div></div>
}

function RemoveDagVote(voter: string, recipient:string){
  

}

function AddDagVote(voter: string, recipient:string){
  
}

export const AppInner =() =>{
  const { address, isConnected } = useAccount()
  const queryClient = new QueryClient()


  const svg  = React.useRef<HTMLDivElement>(null);
 
  var [graph, setGraph] = useState( {"Enter":{"id":"Enter", "name":"Enter","parentIds": [], "treeParentId":"",  "childIds":[]}}as GraphData);
  const handleClick = (id2: string) => {
    getNeighbourhood(id2).then(response=>setGraph(response));
  }


  var [hoverNode, setHoverNode] = useState({"id":"Enter", "name":"Enter","parentIds": [], "treeParentId":"",  "childIds":[]} as NodeData);
  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);


  const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeData) => {
    setHoverNode(node);
    setAnchorEl(event.currentTarget);
    setAnchorElSaver(event.currentTarget);
  };

  const handleMouseStay = (event: React.MouseEvent<HTMLElement>,) => {
    setAnchorEl(anchorElSaver);
  };

  const handleMouseOut = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  React.useEffect(()=>{

    if (svg.current){
      svg.current.replaceChildren(DrawGraph(graph, handleClick, handleMouseOver, handleMouseOut));
    }
  }, [graph]);

  return (<div>
    <div className="AppInner" ref={svg}/>
    <Popover
    id="mouse-over-popover"
    sx={{
      pointerEvents: 'none',
    }}
    open={open}
    anchorEl={anchorEl}
    anchorOrigin={{
      vertical: 'bottom',
      horizontal: 'right',
    }}
    transformOrigin={{
      vertical: 'top',
      horizontal: 'left',
    }}
    onClose={handleMouseOut}
    PaperProps={{
      onMouseEnter: handleMouseStay, 
      onMouseLeave: handleMouseOut, 
      sx: {pointerEvents: 'auto',}
    }}
  >
    {/* <div className='Popover'>Name {hoverNode.name}.  </div>
    <div className='Popover'>Address link to blockexplorer </div>
    <div className='Popover'> Current reputation, onchain reputation </div>
    <div className='Popover'> Current received reputation from metamask address, if loaded </div> */}
    {/* <div className='Popover'> {address} </div> */}
    <div className='Popover'> Button to send/remove Dag vote, if applicable </div>
    <QueryClientProvider client={queryClient}>
      <DagVoteButton voter="0x0000000000000000000000000000000000000008" recipient="0x0000000000000000000000000000000000000005"/>
    </QueryClientProvider>
    {/* <div className='Popover'> Button to move tree vote here, if applicable </div>

    <div className='Popover'> Button to cause position switch with parent, if applicable </div> */}

  </Popover>
  </div>
  );
}
