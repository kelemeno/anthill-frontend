 /// base types, same as in backend

 export type DagVote = {'id': string, 'weight': number, 'posInOther': number}

 export type NodeData = {"id":string, "name":string,  "totalWeight":number; "currentRep": number, "depth":number,  "relRoot":string,  "sentTreeVote": string, "recTreeVotes":string[], "sentDagVotes":DagVote[], "recDagVotes": DagVote[]}
 // Bare is for rendered but not clicked nodes
  export type NodeDataBare =       {"id":string, "name":string,  "totalWeight":number;  "currentRep": number, "depth":number, "relRoot":string, "sentTreeVote": string, "recTreeVotes": string[]}
 // we need parentIds for rendering
 export type NodeDataRendering =  {"id":string, "name":string,  "totalWeight":number;  "currentRep": number, "depth":number,  "relRoot":string, "sentTreeVote": string,  "recTreeVotes": string[], parentIds: string[]}

 export type GraphData= {[id: string]: NodeData;}
 export type GraphDataBare= {[id: string]: NodeDataBare;}
 export type GraphDataRendering= {[id: string]: NodeDataRendering;}

 // functions adapted for use here. 

 export function isVotable(voterId :string,  recipient : NodeDataBare, maxRelRootDepth:number,  anthillGraphServe: GraphData, anthillGraphBareServe: GraphDataBare): boolean{
    // console.log("voter",voter, "recipient", recipient)
    // if ((voter.i == "Enter")) {
    //   return false;
    // }
  
    if ((anthillGraphServe[voterId] === undefined)) {
      const error = new Error("isVotable called with undefined voter with id: "+ voterId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    var voter = anthillGraphServe[voterId]; 
    if (voter.depth<=recipient.depth) {
      return false;
    } else if (recipient.depth+maxRelRootDepth< voter.depth ) {
  
      return false;
    }  
  
    var relRootRecipient = recipient.relRoot;
    var relRootVoter = voter.relRoot;
  
    var relRootVoterAncestor = relRootVoter;
    for (var i = 0; i < maxRelRootDepth; i++) {
      
        if (relRootVoterAncestor == relRootRecipient) {
            return true;
        }
  
        // if we are at the root, we can't take more anscestors
        if ((relRootVoterAncestor == "0x0000000000000000000000000000000000000001")) {
          return false;
        }
  
        relRootVoterAncestor = anthillGraphBareServe[relRootVoterAncestor].sentTreeVote;   
    }
    return false;
  }
  
  // only called for voter = Metamask account, recipient = rendered node 
  export function isDagVote(voterId: string, recipient: NodeDataRendering, maxRelRootDepth:number,  anthillGraphServe: GraphData, anthillGraphBareServe: GraphDataBare): boolean{  
  
    // if ((voter.id == "Enter")) {
    //   return false;
    // }
  
    if ((anthillGraphServe[voterId] === undefined)) {
      const error = new Error("isDagVote called with undefined voter with id: "+ voterId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    if ((anthillGraphBareServe[recipient.id] === undefined)) {
      const error = new Error("isDagVote called with undefined recipientwith id: "+ recipient.id+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    var voterFull = anthillGraphServe[voterId];
  
    // console.log("In idDagVote, voter",voter, "recipient", recipient)
    if ((voterFull.sentDagVotes === undefined) || (voterFull.sentDagVotes.length == 0)) {
      return false;
    }
    if (voterFull.sentDagVotes.map((r)=>r.id).includes(recipient.id)) {
        return true;
    }
    return false;
  }
  
  // only called for voter = Metamask account, recipient = rendered node 
  export function isSwitchable(voterId: string, recipient: NodeDataRendering, maxRelRootDepth:number,  anthillGraphServe: GraphData, anthillGraphBareServe: GraphDataBare): boolean{  
  
    // if ((voter.id == "Enter")) {
    //   return false;
    // }
  
    if ((anthillGraphServe[voterId] === undefined)) {
      const error = new Error("isDagVote called with undefined voter with id: "+ voterId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    if ((anthillGraphBareServe[recipient.id] === undefined)) {
      const error = new Error("isDagVote called with undefined recipientwith id: "+ recipient.id+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    var voterFull = anthillGraphServe[voterId];
  
    // console.log("In idDagVote, voter",voter, "recipient", recipient)
    if ((voterFull.sentTreeVote == recipient.id) && (recipient.currentRep < voterFull.currentRep)) {
      return true;
    }
    
    return false;
  }