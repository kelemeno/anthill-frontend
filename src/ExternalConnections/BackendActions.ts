// The tree actions the UI triggers (join, vote, rename, leave, switch, move),
// sent to the backend as the signed-in passkey user. These used to be contract
// writes; the backend now enforces the same rules. Each returns the action to
// run on click, or `undefined` when nobody is signed in (callers invoke with
// `?.()`). Failures are shown with an alert.
import { type Api, sendAction } from "./Passkey";

function action(
  api: Api,
  fn: string,
  args: Record<string, string> = {},
  onDone?: () => void,
) {
  if (api.session === undefined) {
    return undefined;
  }
  return () =>
    sendAction(api, fn, args).then(onDone, (error: Error) =>
      alert(error.message),
    );
}

export function useAddDagVote(api: Api, recipient: string) {
  return action(api, "addDagVote", { recipient, weight: "1" });
}

export function useRemoveDagVote(api: Api, recipient: string) {
  return action(api, "removeDagVote", { recipient });
}

export function useSwitchWithParent(api: Api) {
  return action(api, "switchPositionWithParent");
}

export function useJoinTree(api: Api, recipient: string) {
  return action(api, "joinTree", {
    name: api.session?.user.name ?? "",
    recipient,
  });
}

export function useChangeName(api: Api, name: string) {
  return action(api, "changeName", { name });
}

export function useLeaveTree(
  api: Api,
  navigate: any,
  setClickedNodeId: any,
  altNode: string,
) {
  return action(api, "leaveTree", {}, () => {
    setClickedNodeId(altNode);
    navigate("/?id=" + altNode);
  });
}

export function useMoveTreeVote(
  api: Api,
  recipient: string,
  setClickedNodeId: any,
  navigate: any,
) {
  return action(api, "moveTreeVote", { recipient }, () => {
    setClickedNodeId(recipient);
    navigate("/?id=" + recipient);
  });
}
