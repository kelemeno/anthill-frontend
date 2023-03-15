// we store the buttons that are used in the graph popup

import React, {useState} from 'react';


import {  NodeDataRendering, GraphDataRendering } from "../Graph/GraphBase";

import {JoinTree, RemoveDagVote, AddDagVote, MoveTreeVote, ChangeName, SwitchWithParent, LeaveTree} from '../ExternalConnections/SmartContractInteractions'


export const DagVoteButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "account":string, "recipient": string,  "graph":GraphDataRendering}) => {
  
    if (!props.isAccountInGraph) return (<div></div>)
  
    var votable= props.graph[props.recipient].isVotable;
    if (votable) {
      
      if (props.graph[props.recipient].isDagVote) {
        return ( <div className='Popover'><button className = 'PopoverButton' onClick={()=>RemoveDagVote(props.AnthillContract, props.chainId, props.account, props.recipient)} >Remove reputation vote</button></div>)
      } 
      else {
  
        return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>AddDagVote(props.AnthillContract, props.chainId, props.account, props.recipient)} >Add reputation vote</button></div>)
      }
    }
    return  <div></div>
  }
  
  export const SwitchParentButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "graph":GraphDataRendering}) => {
    
    if (!props.isAccountInGraph) return (<div></div>)
  
    var switchable= props.graph[props.recipient.id].isSwitchable
    if (switchable) {
      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>SwitchWithParent(props.AnthillContract, props.chainId, props.voter)} >You can switch with your parent!</button></div>)
    }
    if (props.recipient.recTreeVotes.includes(props.voter)) return (<div  className='Popover'> Increase your <br/> reputation to  <br/> switch position <br/> with your parent!</div>)
    return  <div></div>
  }
  
 export const JoinTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNode": any}) => {
    if (props.isAccountInGraph) return (<div></div>)
    if (props.voter === "0x0000000000000000000000000000000000000000") return (<div></div>)
    
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (
        <div className='Popover'> 
        <button className = 'PopoverButton'
           onClick={()=>JoinTree(props.AnthillContract, props.chainId, props.voter, props.recipient.id, props.setClickedNode)}>
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
    if (props.voter === "0x0000000000000000000000000000000000000000") return (<div></div>)
    if (props.voter !== props.recipient.id) return (<div></div>)

  
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
  
  export  const LeaveTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "setIsAccountInGraph":any, "voter":string,"recipient": NodeDataRendering, "setClickedNode":any, "navigate":any, "altNode":string}) => {
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter === "0x0000000000000000000000000000000000000000") return (<div></div>)
    // console.log("joinTreeButton", props.isAccountInGraph, props.voter, props.recipient )
    if (props.voter !== props.recipient.id) return (<div></div>)
   
    return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>LeaveTree( props.AnthillContract, props.chainId,  props.voter, props.setIsAccountInGraph, props.navigate, props.setClickedNode, props.altNode)} >Leave the tree</button></div>)
  }
  
  export  const MoveTreeVoteButton = (props :{"AnthillContract": any, "chainId":number , "isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNode":any, navigate: any}) => {
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter === "0x0000000000000000000000000000000000000000") return (<div></div>)
    // console.log("joinTreeButton", props.isAccountInGraph, props.voter, props.recipient )
    if (props.recipient.recTreeVotes.includes(props.voter)) return (<div></div>)
    if (props.voter === props.recipient.id) return (<div></div>)
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>MoveTreeVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id, props.setClickedNode, props.navigate)} >Move position</button></div>)
    }
    return  <div></div>
  }
  