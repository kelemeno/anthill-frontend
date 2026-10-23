// The community you're in, in the header: a menu to switch to another of yours
// or a public one, see all communities, start one, or (as its founder) change
// this one's settings.
import { ChevronDown, LayoutGrid, Lock, Plus, Settings } from "lucide-react";

import type { Community } from "../api";
import { useApp } from "../state";
import { communityPath, cx, Menu, MenuItem, useAppNavigate } from "../ui";
import { Skeleton } from "./Skeletons";

export function CommunitySwitcher() {
  const { cid, graph, notFound, communities = [], createCommunity, editCommunity } = useApp();
  const navigate = useAppNavigate();
  const here = cid ? (graph?.community ?? communities.find((c) => c.id === cid)) : undefined;
  const yours = communities.filter((c) => c.you !== null);
  const others = communities.filter((c) => c.you === null && c.visibility === "public").slice(0, 4);
  const go = (path: string) => navigate(path, { global: true });

  return (
    <Menu
      align="left"
      button={(toggle) => (
        <button
          type="button"
          data-tour="communities"
          onClick={toggle}
          className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {here?.visibility === "private" && <Lock size={13} className="shrink-0 text-slate-400" />}
          {cid && !here && !notFound ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{here ? here.name : "Communities"}</span>
          )}
          <ChevronDown size={15} className="shrink-0 text-slate-400" />
        </button>
      )}
    >
      {(close) => (
        <>
          {yours.length > 0 && <Section title="Your communities" list={yours} current={cid} pick={(c) => (close(), go(communityPath(c.id, "/")))} />}
          {others.length > 0 && <Section title="Public" list={others} current={cid} pick={(c) => (close(), go(communityPath(c.id, "/")))} />}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <MenuItem icon={<LayoutGrid size={16} />} onClick={() => (close(), go("/"))}>
              All communities
            </MenuItem>
            <MenuItem icon={<Plus size={16} />} onClick={() => (close(), createCommunity())}>
              Start a community
            </MenuItem>
            {here?.isFounder && (
              <MenuItem icon={<Settings size={16} />} onClick={() => (close(), editCommunity())}>
                Settings for {here.name}
              </MenuItem>
            )}
          </div>
        </>
      )}
    </Menu>
  );
}

function Section(props: { title: string; list: Community[]; current?: string; pick: (c: Community) => void }) {
  return (
    <div className="py-1">
      <p className="px-3.5 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{props.title}</p>
      {props.list.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => props.pick(c)}
          className={cx(
            "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-slate-50",
            c.id === props.current ? "font-semibold text-slate-900" : "text-slate-700",
          )}
        >
          <CommunityMark community={c} size={24} />
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          <span className="num shrink-0 text-[12px] text-slate-400">
            {c.you ? `#${c.you.rank}` : `${c.members}`}
          </span>
        </button>
      ))}
    </div>
  );
}

// A community's initial on a colour picked from its address.
export function CommunityMark(props: { community: Pick<Community, "id" | "name" | "visibility">; size?: number }) {
  const size = props.size ?? 36;
  let hash = 0;
  for (const ch of props.community.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [243, 199, 160, 32, 340, 270, 12, 186];
  const hue = hues[hash % hues.length];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${hue} 65% 46%))`,
      }}
    >
      {props.community.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
