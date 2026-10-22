// we store the buttons that are used in the graph popup

import { useState } from "react";
import {
  useAddDagVote,
  useChangeName,
  useJoinTree,
  useLeaveTree,
  useMoveTreeVote,
  useRemoveDagVote,
  useSwitchWithParent,
} from "../ExternalConnections/BackendActions";
import {
  address0,
  type GraphDataRendering,
  type NodeDataRendering,
} from "../Graph/GraphBase";

export const AddDagVoteCheck = (
  isAccountInGraph: boolean,
  hoverNode: NodeDataRendering,
) => {
  return isAccountInGraph && hoverNode?.isVotable && !hoverNode?.isDagVote;
};

export const AddDagVoteButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  account: string;
  recipient: string;
  graph: GraphDataRendering;
}) => {
  const addDagVote = useAddDagVote(props.api, props.recipient);
  return (
    <div className="Popover">
      <button className="PopoverButton" onClick={() => addDagVote?.()}>
        Add reputation vote
      </button>
    </div>
  );
};

export const RemoveDagVoteCheck = (
  isAccountInGraph: boolean,
  hoverNode: NodeDataRendering,
) => {
  return isAccountInGraph && hoverNode?.isVotable && hoverNode?.isDagVote;
};

export const RemoveDagVoteButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  account: string;
  recipient: string;
  graph: GraphDataRendering;
}) => {
  const removeDagVote = useRemoveDagVote(props.api, props.recipient);
  return (
    <div className="Popover">
      <button className="PopoverButton" onClick={() => removeDagVote?.()}>
        Remove reputation vote
      </button>
    </div>
  );
};

export const SwitchParentCheck = (
  isAccountInGraph: boolean,
  recipientNode: NodeDataRendering,
) => {
  return isAccountInGraph && recipientNode?.isSwitchable;
};

export const SwitchParentButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  voter: string;
  recipient: NodeDataRendering;
  graph: GraphDataRendering;
}) => {
  const switchWithParent = useSwitchWithParent(props.api);

  // var switchable= props.graph[props.recipient.id].isSwitchable

  return (
    <div className="Popover">
      <button className="PopoverButton" onClick={() => switchWithParent?.()}>
        Switch positions
      </button>
    </div>
  );
};

export const JoinTreeCheck = (
  isAccountInGraph: boolean,
  voter: string,
  recipientNode: NodeDataRendering,
) => {
  let notFull = false;
  if (recipientNode !== undefined && recipientNode.recTreeVotes !== undefined) {
    notFull = recipientNode.recTreeVotes.length < 2;
  }
  return (
    !isAccountInGraph && voter !== address0 && voter !== undefined && notFull
  );
};

export const JoinTreeButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  voter: string;
  recipient: NodeDataRendering;
  setClickedNode: any;
  setIsAccountInGraph: any;
}) => {
  const joinTree = useJoinTree(props.api, props.recipient.id);

  return (
    <div className="Popover">
      <button className="PopoverButton" onClick={() => joinTree?.()}>
        Join tree here
      </button>
    </div>
  );
};

export const ChangeNameCheck = (
  isAccountInGraph: boolean,
  voter: string,
  recipientNode: NodeDataRendering,
) => {
  return (
    isAccountInGraph &&
    voter !== address0 &&
    recipientNode !== undefined &&
    voter === recipientNode.id
  );
};

export const ChangeNameButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  voter: string;
  recipient: NodeDataRendering;
}) => {
  const [nameInput, setNameInput] = useState("");

  const changeName = useChangeName(props.api, nameInput);

  return (
    <div className="Popover">
      <input
        name="nameInput"
        value={nameInput}
        placeholder="Name"
        autoComplete="off"
        onChange={(event) => setNameInput(event.target.value)}
      />
      <button className="PopoverButton" onClick={() => changeName?.()}>
        Change name
      </button>
    </div>
  );
};

export const LeaveTreeCheck = (
  isAccountInGraph: boolean,
  voter: string,
  recipientNode: NodeDataRendering,
) => {
  return (
    isAccountInGraph &&
    voter !== address0 &&
    recipientNode !== undefined &&
    voter === recipientNode.id
  );
};

export const LeaveTreeButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  setIsAccountInGraph: any;
  voter: string;
  recipient: NodeDataRendering;
  setClickedNode: any;
  navigate: any;
  altNode: string;
}) => {
  const leaveTree = useLeaveTree(
    props.api,
    props.navigate,
    props.setClickedNode,
    props.altNode,
  );
  return (
    <div className="Popover">
      <button className="PopoverButton" onClick={() => leaveTree?.()}>
        Leave the tree
      </button>
    </div>
  );
};

export const MoveTreeVoteCheck = (
  isAccountInGraph: boolean,
  voter: string,
  recipientNode: NodeDataRendering,
) => {
  let notFull = false;
  if (recipientNode !== undefined && recipientNode.recTreeVotes !== undefined) {
    notFull = recipientNode.recTreeVotes.length < 2;
  }

  return (
    isAccountInGraph &&
    voter !== address0 &&
    notFull &&
    voter !== recipientNode.id &&
    !recipientNode.recTreeVotes.includes(voter)
  );
};

export const MoveTreeVoteButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  voter: string;
  recipient: NodeDataRendering;
  setClickedNode: any;
  navigate: any;
}) => {
  const moveTreeVote = useMoveTreeVote(
    props.api,
    props.recipient.id,
    props.setClickedNode,
    props.navigate,
  );
  return (
    <div className="Popover">
      <button className="PopoverButton" onClick={() => moveTreeVote?.()}>
        Move position
      </button>
    </div>
  );
};
