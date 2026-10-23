// we store the buttons that are used in the graph popup

import {
  ArrowLeftRight,
  Check,
  CornerDownRight,
  Heart,
  HeartOff,
  Link2,
  LogOut,
  UserPlus,
} from "lucide-react";
import { type ReactNode, useState } from "react";
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

// One action on a node card: icon + label. The backend dry-runs it first; if
// it would fail, the row is greyed out with the reason underneath.
function ActionRow(props: {
  api: Api;
  fn: string;
  args: Record<string, string>;
  label: string;
  icon: ReactNode;
  primary?: boolean;
  run: (() => unknown) | undefined;
}) {
  const check = useActionCheck(props.api, props.fn, props.args);
  const blocked = check !== undefined && !check.ok;
  return (
    <div>
      <button
        type="button"
        className={`CardAction${props.primary ? " CardAction--primary" : ""}`}
        disabled={blocked}
        onClick={() => props.run?.()}
      >
        {props.icon}
        {props.label}
      </button>
      {blocked && <div className="CardReason">{check.reason}</div>}
    </div>
  );
}

const ICON = 16;

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
  const name = props.graph[props.recipient]?.name ?? "them";
  return (
    <ActionRow
      api={props.api}
      fn="addDagVote"
      args={{ recipient: props.recipient, weight: "1" }}
      label={`Endorse ${name}`}
      icon={<Heart size={ICON} />}
      primary
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
      label="Remove my endorsement"
      icon={<HeartOff size={ICON} />}
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
      label={`Swap places with ${props.recipient.name}`}
      icon={<ArrowLeftRight size={ICON} />}
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
      label={`Join under ${props.recipient.name}`}
      icon={<UserPlus size={ICON} />}
      primary
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
    <form
      className="CardRename"
      onSubmit={(e) => {
        e.preventDefault();
        if (nameInput.trim()) changeName?.();
      }}
    >
      <input
        name="nameInput"
        value={nameInput}
        placeholder="New name"
        maxLength={40}
        autoComplete="off"
        onChange={(event) => setNameInput(event.target.value)}
      />
      <button type="submit" disabled={!nameInput.trim()} title="Rename" aria-label="Rename">
        <Check size={ICON} />
      </button>
    </form>
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
    <button
      type="button"
      className="CardAction CardAction--danger"
      onClick={() => {
        if (
          confirm(
            "Leave the tree? Your endorsements (given and received) are removed, and the people under you move up.",
          )
        ) {
          leaveTree?.();
        }
      }}
    >
      <LogOut size={ICON} />
      Leave the tree
    </button>
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
      label={`Move under ${props.recipient.name}`}
      icon={<CornerDownRight size={ICON} />}
      run={moveTreeVote}
    />
  );
};

// On your own node: create a one-time invite link and copy it. Whoever opens
// it joins under you (or the nearest free spot below you).
export const InviteButton = (props: { api: Api }) => {
  const [status, setStatus] = useState("");
  return (
    <div>
      <button
        type="button"
        className="CardAction"
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
        <Link2 size={ICON} />
        Copy invite link
      </button>
      {status && <div className="CardReason">{status}</div>}
    </div>
  );
};
