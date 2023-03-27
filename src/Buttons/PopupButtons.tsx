// we store the buttons that are used in the graph popup

import React, {useState} from 'react';


import {  NodeDataRendering, GraphDataRendering, address0 } from "../Graph/GraphBase";

import {JoinTree, RemoveDagVote, AddDagVote, MoveTreeVote, ChangeName, SwitchWithParent, LeaveTree} from '../ExternalConnections/SmartContractInteractions'


// import { useContractWrite, usePrepareContractWrite } from 'wagmi'
// import AnthillJson from "../ExternalConnections/Anthill.json"

export const AddDagVoteCheck = (isAccountInGraph: boolean, hoverNode: NodeDataRendering) => {
  return (isAccountInGraph) && (hoverNode?.isVotable) && (!hoverNode?.isDagVote)

}

export const AddDagVoteButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "account":string, "recipient": string,  "graph":GraphDataRendering}) => {
  var addDagVote = AddDagVote(props.AnthillContract,  props.account, props.recipient)
  return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>addDagVote?.()} >Add reputation vote</button></div>)
}


export const RemoveDagVoteCheck = (isAccountInGraph: boolean, hoverNode: NodeDataRendering) => {
  return (isAccountInGraph) && (hoverNode?.isVotable) && (hoverNode?.isDagVote)
}

export const RemoveDagVoteButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "account":string, "recipient": string,  "graph":GraphDataRendering}) => {
  // var addDagVote = AddDagVote(props.AnthillContract,  props.account, props.recipient)
  var removeDagVote = RemoveDagVote(props.AnthillContract,  props.account, props.recipient)      
  return ( <div className='Popover'><button className = 'PopoverButton' onClick={()=>removeDagVote?.()} >Remove reputation vote</button></div>)
}


export const SwitchParentCheck = (isAccountInGraph: boolean, recipientNode: NodeDataRendering) => {
  return (isAccountInGraph) && (recipientNode?.isSwitchable) 
}

export const SwitchParentButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "graph":GraphDataRendering}) => {
  
  var switchWithParent = SwitchWithParent(props.AnthillContract,  props.voter)

  // var switchable= props.graph[props.recipient.id].isSwitchable

  return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>switchWithParent?.()} >Switch positions</button></div>)
  
}


export const JoinTreeCheck = (isAccountInGraph: boolean, voter:string, recipientNode: NodeDataRendering) => {
  var notFull = false
  if ((recipientNode !== undefined) && (recipientNode.recTreeVotes !== undefined) ){
    notFull = (recipientNode.recTreeVotes.length < 2) 
  }
  return (!isAccountInGraph) && (voter !== address0) && (voter !== undefined) && (notFull) 
}

export const JoinTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNode": any, "setIsAccountInGraph":any}) => {
  
  var joinTree = JoinTree(props.AnthillContract,  props.voter, props.recipient.id, props.setClickedNode, props.setIsAccountInGraph);

  return (
    <div className='Popover'> 
    <button className = 'PopoverButton'
        onClick={()=>joinTree?.()}>
        Join tree here
    </button>
    </div>
  )

}


export const ChangeNameCheck = (isAccountInGraph: boolean, voter:string, recipientNode: NodeDataRendering) => {
  return (isAccountInGraph) && (voter !== address0) && (recipientNode !== undefined) && (voter === recipientNode.id) 
}

export  const ChangeNameButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering}) => {
  var [nameInput, setNameInput] = useState("")
  
  var changeName = ChangeName(props.AnthillContract,  props.voter, nameInput)
    
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
                  ()=>changeName?.()}>
                  Change name
              </button>
            
      </div>)
  
  
}


export const LeaveTreeCheck = (isAccountInGraph: boolean,voter:string, recipientNode: NodeDataRendering) => {
  return (isAccountInGraph) && (voter !== address0) && (recipientNode !== undefined) && (voter === recipientNode.id)
}


export  const LeaveTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "setIsAccountInGraph":any, "voter":string,"recipient": NodeDataRendering, "setClickedNode":any, "navigate":any, "altNode":string}) => {
  var leaveTree = LeaveTree(props.AnthillContract,  props.voter, props.setIsAccountInGraph, props.navigate, props.setClickedNode, props.altNode) 
  return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>leaveTree?.()} >Leave the tree</button></div>)
}


export const MoveTreeVoteCheck = (isAccountInGraph: boolean, voter:string, recipientNode: NodeDataRendering) => {
  
  var notFull = false
  if ((recipientNode !== undefined) && (recipientNode.recTreeVotes !== undefined) ){
    notFull = (recipientNode.recTreeVotes.length < 2) 
  }

  return (isAccountInGraph) && (voter !== address0) && (notFull) && (voter !== recipientNode.id) && (!recipientNode.recTreeVotes.includes(voter)) 
}

export  const MoveTreeVoteButton = (props :{"AnthillContract": any, "chainId":number , "isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNode":any, navigate: any}) => {
  
  var moveTreeVote = MoveTreeVote(props.AnthillContract,  props.voter, props.recipient.id, props.setClickedNode, props.navigate)
  return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>moveTreeVote?.()} >Move position</button></div>)

}
