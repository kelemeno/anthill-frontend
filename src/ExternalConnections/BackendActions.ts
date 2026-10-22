// The tree actions the UI triggers (join, vote, rename, leave, switch, move),
// sent to the backend as the signed-in passkey user. These used to be contract
// writes; the backend now enforces the same rules. Each returns the action to
// run on click, or `undefined` when nobody is signed in (callers invoke with
// `?.()`). Failures are shown with an alert.
import { useEffect, useState } from "react";
import { type Api, request, sendAction } from "./Passkey";

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

//// Why an action isn't possible

export type CheckResult = { ok: true } | { ok: false; reason: string };

// Dry-run results, per user + action. Cleared whenever the backend announces
// an update (see GraphMain), since any change can make an action (im)possible.
const checkCache = new Map<string, Promise<CheckResult>>();

export function invalidateChecks() {
  checkCache.clear();
}

export function checkAction(
  api: Api,
  fn: string,
  args: Record<string, string>,
): Promise<CheckResult> | undefined {
  if (api.session === undefined) return undefined;
  const key = `${api.session.user.id}|${fn}|${JSON.stringify(args)}`;
  let result = checkCache.get(key);
  if (result === undefined) {
    result = request<{ results: CheckResult[] }>(
      api.backendUrl,
      "check",
      { actions: [{ fn, args }] },
      api.session.token,
    ).then((r) => r.results[0]);
    checkCache.set(key, result);
    result.catch(() => checkCache.delete(key));
  }
  return result;
}

// Whether the action would succeed, and if not why; undefined while unknown.
export function useActionCheck(
  api: Api,
  fn: string,
  args: Record<string, string>,
): CheckResult | undefined {
  const argsKey = JSON.stringify(args);
  const [result, setResult] = useState<CheckResult | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: argsKey stands in for args
  useEffect(() => {
    setResult(undefined);
    let cancelled = false;
    checkAction(api, fn, args)?.then(
      (r) => !cancelled && setResult(r),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [api.backendUrl, api.session?.token, fn, argsKey]);
  return result;
}
