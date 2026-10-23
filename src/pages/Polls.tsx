// Polls weighted by reputation: an option's weight is the total reputation of
// the people who chose it. Members create polls and vote (and can change their
// vote while it's open); whoever asked can close it, freezing the result.
import { Check, Lock, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { closePoll, createPoll, fetchPolls, type Poll, votePoll } from "../api";
import { formatRep, toNumber } from "../model";
import { useApp } from "../state";
import { Skeleton } from "../components/Skeletons";
import { AppLink, Avatar, Badge, Button, Card, cx, Empty, Field, Modal } from "../ui";

// the polls each community last showed, for coming back without a wait
const shown = new Map<string, Poll[]>();

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

export function PollsPage() {
  const { graph, cid = "", session, viewer, previewing, notify, openAuth } = useApp();
  const [polls, setPolls] = useState<Poll[] | undefined>(() => shown.get(cid));
  const [creating, setCreating] = useState(false);
  const isMember = session !== undefined && viewer !== undefined && !previewing;

  const refresh = useCallback(() => {
    fetchPolls(cid, session).then(
      (list) => {
        shown.set(cid, list);
        setPolls(list);
      },
      (e: Error) => notify(e.message),
    );
  }, [cid, session, notify]);

  // refresh on reputation changes, and every 15 s for others' votes
  // biome-ignore lint/correctness/useExhaustiveDependencies: graph.version triggers it
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh, graph?.version]);

  const run = (work: () => Promise<unknown>) => () =>
    work().then(refresh, (e: Error) => notify(e.message));

  const open = polls?.filter((p) => !p.closedAt) ?? [];
  const closed = polls?.filter((p) => p.closedAt) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3" data-tour="polls">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Polls</h1>
          <p className="mt-1 text-sm text-slate-500">
            Votes count by reputation: an option's weight is the total reputation of the people
            who chose it.
          </p>
        </div>
        {isMember ? (
          <Button variant="primary" data-tour="new-poll" onClick={() => setCreating(true)}>
            <Plus size={16} /> New poll
          </Button>
        ) : !session ? (
          <Button onClick={() => openAuth("signin")}>Sign in to vote</Button>
        ) : null}
      </div>

      {polls === undefined &&
        [0, 1].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
            <Skeleton className="mt-5 h-9 w-full rounded-lg" />
            <Skeleton className="mt-2 h-9 w-full rounded-lg" />
          </Card>
        ))}
      {polls?.length === 0 && (
        <Card>
          <Empty>No polls yet.{isMember ? " Ask the first question." : ""}</Empty>
        </Card>
      )}
      {open.map((p) => (
        <PollCard
          key={p.id}
          poll={p}
          canVote={isMember}
          canClose={isMember && p.by === session?.user.id}
          onVote={(i) => session && run(() => votePoll(session, cid, p.id, i))()}
          onClose={() =>
            session &&
            confirm("Close this poll? The result is frozen at the current reputations.") &&
            run(() => closePoll(session, cid, p.id))()
          }
        />
      ))}
      {closed.length > 0 && (
        <h2 className="pt-2 text-[13px] font-semibold tracking-wide text-slate-400 uppercase">Closed</h2>
      )}
      {closed.map((p) => (
        <PollCard key={p.id} poll={p} canVote={false} canClose={false} onVote={() => {}} onClose={() => {}} />
      ))}

      {creating && session && (
        <NewPollModal
          onClose={() => setCreating(false)}
          onCreate={async (question, options) => {
            await createPoll(session, cid, question, options);
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PollCard(props: {
  poll: Poll;
  canVote: boolean;
  canClose: boolean;
  onVote: (option: number) => void;
  onClose: () => void;
}) {
  const { poll } = props;
  const { graph } = useApp();
  const weights = poll.tally.map((t) => toNumber(t.weight));
  const total = weights.reduce((a, b) => a + b, 0);
  const voters = poll.tally.reduce((a, t) => a + t.voters, 0);
  const lead = Math.max(...weights);
  const asker = graph?.nodes[poll.by] ?? { id: poll.by, name: poll.byName || "Someone" };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-slate-900">{poll.question}</h2>
        {poll.closedAt ? (
          <Badge>
            <Lock size={12} /> Closed
          </Badge>
        ) : (
          <Badge tone="emerald">Open</Badge>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[13px] text-slate-500">
        <Avatar person={asker} size={20} />
        <AppLink to={`/p/${poll.by}`} className="hover:text-slate-900 hover:underline">
          {asker.name}
        </AppLink>
        <span>·</span>
        <span>{ago(poll.createdAt)}</span>
        <span>·</span>
        <span>
          {voters} {voters === 1 ? "voter" : "voters"}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {poll.options.map((option, i) => {
          const share = total === 0 ? 0 : weights[i] / total;
          const mine = poll.myVote === i;
          const leading = total > 0 && weights[i] === lead;
          const clickable = props.canVote && !mine;
          return (
            <button
              key={option}
              type="button"
              disabled={!clickable}
              onClick={() => props.onVote(i)}
              className={cx(
                "relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                mine ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200",
                clickable ? "cursor-pointer hover:border-indigo-300" : "cursor-default",
              )}
            >
              <span
                className={cx("absolute inset-y-0 left-0", leading ? "bg-indigo-100" : "bg-slate-100")}
                style={{ width: `${share * 100}%` }}
              />
              <span className="relative flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-900">
                {mine && <Check size={15} className="shrink-0 text-indigo-600" />}
                <span className="truncate">{option}</span>
              </span>
              <span className="num relative shrink-0 text-[13px] text-slate-500">
                {Math.round(share * 100)}% · {formatRep(weights[i])} rep · {poll.tally[i].voters}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-slate-400">
        <span>
          {poll.closedAt
            ? `Closed ${ago(poll.closedAt)}: reputations frozen then.`
            : props.canVote
              ? "Tap an option to vote; you can change your vote until it closes."
              : "Weighted by current reputation."}
        </span>
        {props.canClose && (
          <Button size="sm" variant="ghost" onClick={props.onClose}>
            <Lock size={14} /> Close poll
          </Button>
        )}
      </div>
    </Card>
  );
}

function NewPollModal(props: { onClose: () => void; onCreate: (q: string, options: string[]) => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  return (
    <Modal
      title="New poll"
      onClose={props.onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !question.trim() || filled.length < 2}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await props.onCreate(question.trim(), filled);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create poll
          </Button>
        </>
      }
    >
      <Field label="Question" value={question} onChange={setQuestion} maxLength={200} autoFocus />
      <p className="mt-4 mb-1 text-[13px] font-medium text-slate-700">Options</p>
      <div className="space-y-2">
        {options.map((option, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: options have no ids
          <div key={i} className="flex gap-2">
            <input
              value={option}
              maxLength={80}
              placeholder={`Option ${i + 1}`}
              onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {options.length > 2 && (
              <Button
                variant="ghost"
                aria-label="Remove option"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </Button>
            )}
          </div>
        ))}
      </div>
      {options.length < 6 && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOptions([...options, ""])}>
          <Plus size={14} /> Add option
        </Button>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}
