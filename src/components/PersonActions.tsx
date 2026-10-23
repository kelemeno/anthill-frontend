// What you can do with someone: endorse, remove your endorsement, swap places
// (with your parent), move under them, join under them. Each is dry-run on the
// server first; impossible ones are shown greyed out with the reason.
import { ArrowLeftRight, CornerDownRight, Heart, HeartOff, UserPlus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { type Action, act, type Check, check, type Person, type Session } from "../api";
import { useApp } from "../state";
import { cx } from "../ui";

type Item = { action: Action; label: string; icon: ReactNode; primary?: boolean };

function itemsFor(me: Person | undefined, them: Person): Item[] {
  const name = them.name;
  if (!me) {
    return [
      {
        action: { fn: "joinTree", args: { name: "", recipient: them.id } },
        label: `Join the tree under ${name}`,
        icon: <UserPlus size={16} />,
        primary: true,
      },
    ];
  }
  if (me.id === them.id) return [];
  const items: Item[] = [];
  const endorses = me.sentDagVotes.some((v) => v.id === them.id);
  items.push(
    endorses
      ? {
          action: { fn: "removeDagVote", args: { recipient: them.id } },
          label: "Remove my endorsement",
          icon: <HeartOff size={16} />,
        }
      : {
          action: { fn: "addDagVote", args: { recipient: them.id, weight: "1" } },
          label: `Endorse ${name}`,
          icon: <Heart size={16} />,
          primary: true,
        },
  );
  if (me.sentTreeVote === them.id) {
    items.push({
      action: { fn: "switchPositionWithParent", args: {} },
      label: `Swap places with ${name}`,
      icon: <ArrowLeftRight size={16} />,
    });
  }
  if (them.recTreeVotes.length < 2 && me.sentTreeVote !== them.id) {
    items.push({
      action: { fn: "moveTreeVote", args: { recipient: them.id } },
      label: `Move under ${name}`,
      icon: <CornerDownRight size={16} />,
    });
  }
  return items;
}

export function PersonActions(props: { them: Person }) {
  const { graph, cid = "", session, viewer, previewing, reload } = useApp();
  const [checks, setChecks] = useState<Check[] | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // signed in but not in the tree yet: offer joining
  const me = viewer && graph?.nodes[viewer.id] ? viewer : undefined;
  const items = graph ? itemsFor(me, props.them) : [];
  if (session && !me) {
    for (const item of items) {
      if (item.action.fn === "joinTree") item.action.args.name = session.user.name;
    }
  }
  const key = JSON.stringify([cid, session?.token, graph?.version, items.map((i) => i.action)]);

  useEffect(() => {
    setChecks(undefined);
    if (!session || items.length === 0) return;
    let cancelled = false;
    check(session, cid, items.map((i) => i.action)).then(
      (r) => !cancelled && setChecks(r),
      () => {},
    );
    return () => {
      cancelled = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: key covers it
  }, [key]);

  if (items.length === 0) return null;

  const run = async (s: Session, action: Action) => {
    setBusy(true);
    setError("");
    try {
      await act(s, cid, action);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const result = checks?.[i];
        const blocked = !session || previewing || (result !== undefined && !result.ok);
        const reason = !session
          ? previewing
            ? "Preview: sign in to do this yourself."
            : "Sign in to do this."
          : result && !result.ok
            ? result.reason
            : undefined;
        return (
          <div key={item.label}>
            <button
              type="button"
              disabled={blocked || busy}
              onClick={() => session && run(session, item.action)}
              className={cx(
                "flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors",
                "disabled:cursor-not-allowed",
                item.primary && !blocked
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200",
                blocked && "bg-slate-50 text-slate-400 hover:bg-slate-50",
              )}
            >
              {item.icon}
              {item.label}
            </button>
            {reason && <p className="mt-1 mb-1.5 px-1 text-[13px] leading-snug text-slate-500">{reason}</p>}
          </div>
        );
      })}
      {error && <p className="px-1 text-[13px] text-red-600">{error}</p>}
    </div>
  );
}
