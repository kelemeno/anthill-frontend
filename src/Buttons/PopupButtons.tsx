import React, {useState} from 'react';

import {isVotable, isDagVote, isSwitchable,} from '../Graph/GraphCore/GraphBase';

import { LoadNeighbourhood,    serveParent} from '../Graph/GraphCore/LoadGraph';
import { NodeData, NodeDataBare, GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering } from "../Graph/GraphCore/GraphBase";

import {JoinTree, RemoveDagVote, AddDagVote, MoveTreeVote, ChangeName, SwitchWithParent, LeaveTree} from '../ExternalConnections/SmartContractInteractions'


export const DagVoteButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, }) => {
  
    if (!props.isAccountInGraph) return (<div></div>)
  
    var votable= isVotable(props.voter, props.recipient, maxRelRootDepth, anthillGraphServe, anthillGraphBareServe)
    if (votable) {
      
      if (isDagVote(props.voter, props.recipient)) {
        return ( <div className='Popover'><button className = 'PopoverButton' onClick={()=>RemoveDagVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id)} >Remove reputation vote</button></div>)
      } 
      else {
  
        return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>AddDagVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id)} >Add reputation vote</button></div>)
      }
    }
    return  <div></div>
  }
  
  export const SwitchParentButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering}) => {
    
    if (!props.isAccountInGraph) return (<div></div>)
  
    var switchable= isSwitchable(props.voter , props.recipient) 
    if (switchable) {
      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>SwitchWithParent(props.AnthillContract, props.chainId, props.voter)} >You can switch with your parent!</button></div>)
    }
    if (props.recipient.recTreeVotes.includes(props.voter)) return (<div  className='Popover'> Increase your <br/> reputation to  <br/> switch position <br/> with your parent!</div>)
    return  <div></div>
  }
  
 export const JoinTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNodeId": any}) => {
    if (props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (
        <div className='Popover'> 
        <button className = 'PopoverButton'
           onClick={()=>JoinTree(props.AnthillContract, props.chainId, props.voter, props.recipient.id, props.setClickedNodeId)}>
            Join tree here
        </button>
        </div>
      )
    }
    return <div></div>
  }
  
  export  const ChangeNameButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering}) => {
    var [nameInput, setNameInput] = useState("")
    
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    if (props.voter != props.recipient.id) return (<div></div>)

  
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (
        <div className='Popover'>
            
                <input
                    name='nameInput'
                    value={nameInput}
                    placeholder='Name'
                    autoComplete="off"
                    onChange={(event) =>
                        setNameInput(event.target.value)
                      }
                />
                <button className = 'PopoverButton' onClick={
                    ()=>ChangeName(props.AnthillContract, props.chainId, props.voter, nameInput)}>
                    Change name
                </button>
              
        </div>)
    }
    return  <div></div>
  }
  
  export  const LeaveTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "setIsAccountInGraph":any, "voter":string,"recipient": NodeDataRendering, "setClickedNodeId":any, "navigate":any}) => {
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    // console.log("joinTreeButton", props.isAccountInGraph, props.voter, props.recipient )
    if (props.voter != props.recipient.id) return (<div></div>)
   
    return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>LeaveTree( props.AnthillContract, props.chainId,  props.voter, props.setIsAccountInGraph, props.navigate, props.setClickedNodeId)} >Leave the tree</button></div>)
  }
  
  export  const MoveTreeVoteButton = (props :{"AnthillContract": any, "chainId":number , "isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNodeId":any, navigate: any}) => {
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    // console.log("joinTreeButton", props.isAccountInGraph, props.voter, props.recipient )
    if (props.recipient.recTreeVotes.includes(props.voter)) return (<div></div>)
    if (props.voter == props.recipient.id) return (<div></div>)
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>MoveTreeVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id, props.setClickedNodeId, props.navigate)} >Move position</button></div>)
    }
    return  <div></div>
  }
  