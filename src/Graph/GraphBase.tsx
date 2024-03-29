 /// base types, similar to backend
 // also some graph related functions. 

 export const address0 ="0x0000000000000000000000000000000000000000";
 export const address1 ="0x0000000000000000000000000000000000000001";


 
 export type DagVote = {'id': string, 'weight': number, 'posInOther': number}

 export type NodeData = {"id":string, "name":string,  "totalWeight":number; "currentRep": number, "depth":number,  "relRoot":string,  "sentTreeVote": string, "recTreeVotes":string[], "sentDagVotes":DagVote[], "recDagVotes": DagVote[]}
 // Bare is for rendered but not clicked nodes
  export type NodeDataBare =       {"id":string, "name":string,  "totalWeight":number;  "currentRep": number, "depth":number, "relRoot":string, "sentTreeVote": string, "recTreeVotes": string[], }
 // we need parentIds for rendering
 export type NodeDataRendering =  {"id":string, "name":string,  "totalWeight":number;  "currentRep": number, "depth":number,  "relRoot":string, "sentTreeVote": string,  "recTreeVotes": string[], parentIds: string[], "isVotable": boolean, "isSwitchable": boolean, "isDagVote":boolean}

 export type GraphData= {[id: string]: NodeData;}
 export type GraphDataBare= {[id: string]: NodeDataBare;}
 export type GraphDataRendering= {[id: string]: NodeDataRendering;}

export const nameShortener= (d:string) => {
  if (d.length <= 6) {
    return d;
  } else {
    return d.slice(0, 3)+".."+d.slice((d.length)-3);
  }
}

 // functions adapted for use here. 

 export function isVotable(voterId :string,  recipient : NodeDataBare, maxRelRootDepth:number,  anthillGraph: GraphData, anthillGraphBare: GraphDataBare): boolean{
    // console.log("voter",voter, "recipient", recipient)
    // if ((voter.i == "Enter")) {
    //   return false;
    // }
    if (voterId === address0) {return false};
    if ((anthillGraph[voterId] === undefined)) {
      const error = new Error("isVotable called with undefined voter with id: "+ voterId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    var voter = anthillGraph[voterId]; 
    if (voter.depth<=recipient.depth) {
      return false;
    } else if (recipient.depth+maxRelRootDepth< voter.depth ) {
  
      return false;
    }  
  
    var relRootRecipient = recipient.relRoot;
    var relRootVoter = voter.relRoot;
  
    var relRootVoterAncestor = relRootVoter;
    for (var i = 0; i < maxRelRootDepth; i++) {
      
        if (relRootVoterAncestor === relRootRecipient) {
            return true;
        }
  
        // if we are at the root, we can't take more anscestors
        if ((relRootVoterAncestor === "0x0000000000000000000000000000000000000001")) {
          return false;
        }
  
        relRootVoterAncestor = anthillGraphBare[relRootVoterAncestor].sentTreeVote;   
    }
    return false;
  }
  
  // only called for voter = Metamask account, recipient = rendered node 
  export function isDagVote(voterId: string, recipientId: string, maxRelRootDepth:number,  anthillGraph: GraphData, anthillGraphBare: GraphDataBare): boolean{  
  
    // if ((voter.id == "Enter")) {
    //   return false;
    // }
    if (voterId === address0) {return false};

    if ((anthillGraph[voterId] === undefined)) {
      const error = new Error("isDagVote called with undefined voter with id: "+ voterId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    if ((anthillGraphBare[recipientId] === undefined)) {
      const error = new Error("isDagVote called with undefined recipient with id: "+ recipientId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    var voterFull = anthillGraph[voterId];
  
    // console.log("In idDagVote, voter",voter, "recipient", recipient)
    if ((voterFull.sentDagVotes === undefined) || (voterFull.sentDagVotes.length === 0)) {
      return false;
    }
    if (voterFull.sentDagVotes.map((r)=>r.id).includes(recipientId)) {
        return true;
    }
    return false;
  }
  
  // only called for voter = Metamask account, recipient = rendered node 
  export function isSwitchable(voterId: string, recipientId: string, recipientRep:number, maxRelRootDepth:number,  anthillGraph: GraphData, anthillGraphBare: GraphDataBare): boolean{  
  
    // if ((voter.id == "Enter")) {
    //   return false;
    // }
    
    if (voterId === address0) {return false};

    if ((anthillGraph[voterId] === undefined)) {
      const error = new Error("isSwitchable called with undefined voter with id: "+ voterId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    if ((anthillGraphBare[recipientId] === undefined)) {
      const error = new Error("isSwitchable called with undefined recipientwith id: "+ recipientId+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
      throw error;
    }
  
    var voterFull = anthillGraph[voterId];
  
    // console.log("In idDagVote, voter",voter, "recipient", recipient)
    if ((voterFull.sentTreeVote === recipientId) && (recipientRep < voterFull.currentRep)) {
      return true;
    }
    
    return false;
  }