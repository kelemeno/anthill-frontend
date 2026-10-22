// we store the buttons that are used in the graph popup

import { useState } from "react";
import {
  useActionCheck,
  useAddDagVote,
  useChangeName,
  useJoinTree,
  useLeaveTree,
  useMoveTreeVote,
  useRemoveDagVote,
  useSwitchWithParent,
} from "../ExternalConnections/BackendActions";
import { createInvite, inviteLink } from "../ExternalConnections/Community";
import type { Api } from "../ExternalConnections/Passkey";
import {
  address0,
  type GraphDataRendering,
  type NodeDataRendering,
} from "../Graph/GraphBase";

// A button for one tree action. The backend dry-runs it first; if it would
// fail, the button is greyed out with the reason underneath.
function ActionRow(props: {
  api: Api;
  fn: string;
  args: Record<string, string>;
  label: string;
  run: (() => unknown) | undefined;
}) {
  const check = useActionCheck(props.api, props.fn, props.args);
  const blocked = check !== undefined && !check.ok;
  return (
    <div className="Popover">
      <button
        className="PopoverButton"
        disabled={blocked}
        onClick={() => props.run?.()}
      >
        {props.label}
      </button>
      {blocked && <div className="PopoverReason">{check.reason}</div>}
    </div>
  );
}

// Shown for anyone else you don't vote for yet; if you can't vote for them,
// the dry run says why.
export const AddDagVoteCheck = (
  isAccountInGraph: boolean,
  account: string,
  hoverNode: NodeDataRendering,
) => {
  return (
    isAccountInGraph &&
    hoverNode !== undefined &&
    hoverNode.id !== account &&
    !hoverNode.isDagVote
  );
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
    <ActionRow
      api={props.api}
      fn="addDagVote"
      args={{ recipient: props.recipient, weight: "1" }}
      label="Add reputation vote"
      run={addDagVote}
    />
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
    <ActionRow
      api={props.api}
      fn="removeDagVote"
      args={{ recipient: props.recipient }}
      label="Remove reputation vote"
      run={removeDagVote}
    />
  );
};

// Shown on your parent; the dry run explains when your reputation isn't higher.
export const SwitchParentCheck = (
  isAccountInGraph: boolean,
  parentId: string | undefined,
  recipientNode: NodeDataRendering,
) => {
  return isAccountInGraph && recipientNode !== undefined && recipientNode.id === parentId;
};

export const SwitchParentButton = (props: {
  api: any;
  isAccountInGraph: boolean;
  voter: string;
  recipient: NodeDataRendering;
  graph: GraphDataRendering;
}) => {
  const switchWithParent = useSwitchWithParent(props.api);
  return (
    <ActionRow
      api={props.api}
      fn="switchPositionWithParent"
      args={{}}
      label="Switch positions"
      run={switchWithParent}
    />
  );
};

export const JoinTreeCheck = (
  isAccountInGraph: boolean,
  voter: string,
  recipientNode: NodeDataRendering,
  inviteOnly: boolean,
) => {
  if (inviteOnly) return false;
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
    <ActionRow
      api={props.api}
      fn="joinTree"
      args={{ name: props.api.session?.user.name ?? "", recipient: props.recipient.id }}
      label="Join tree here"
      run={joinTree}
    />
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
    <ActionRow
      api={props.api}
      fn="moveTreeVote"
      args={{ recipient: props.recipient.id }}
      label="Move position"
      run={moveTreeVote}
    />
  );
};

// On your own node: create a one-time invite link and copy it. Whoever opens
// it joins under you (or the nearest free spot below you).
export const InviteButton = (props: { api: Api }) => {
  const [status, setStatus] = useState("");
  return (
    <div className="Popover">
      <button
        className="PopoverButton"
        onClick={async () => {
          try {
            const { code } = await createInvite(props.api);
            const link = inviteLink(code);
            await navigator.clipboard.writeText(link).then(
              () => setStatus("Invite link copied. It works once, for 14 days."),
              () => setStatus(link),
            );
          } catch (error) {
            setStatus((error as Error).message);
          }
        }}
      >
        Copy invite link
      </button>
      {status && <div className="PopoverReason">{status}</div>}
    </div>
  );
};
