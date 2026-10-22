// Side panel with reputation-weighted polls: each option's weight is the sum of
// its voters' reputation. Members can create polls and vote (and change their
// vote until the poll is closed); the creator can close a poll, which freezes
// the result.
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import TextField from "@mui/material/TextField";
import { useCallback, useEffect, useState } from "react";

import { getIsNodeInGraph } from "../ExternalConnections/BackendGetters";
import {
  closePoll,
  createPoll,
  formatReputation,
  listPolls,
  type PollView,
  votePoll,
} from "../ExternalConnections/Community";
import type { Api } from "../ExternalConnections/Passkey";

export function PollsDrawer(props: { api: Api; open: boolean; onClose: () => void }) {
  const [polls, setPolls] = useState<PollView[] | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listPolls(props.api).then(setPolls, (e: Error) => setError(e.message));
  }, [props.api]);

  const userId = props.api.session?.user.id;
  useEffect(() => {
    if (!props.open) return;
    refresh();
    // keep tallies fresh while the panel is open
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [props.open, refresh]);

  useEffect(() => {
    if (!props.open || userId === undefined) {
      setIsMember(false);
      return;
    }
    getIsNodeInGraph(props.api.backendUrl, userId).then(setIsMember, () => {});
  }, [props.open, props.api.backendUrl, userId]);

  const act = (work: () => Promise<unknown>) => async () => {
    setError("");
    try {
      await work();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Drawer anchor="right" open={props.open} onClose={props.onClose}>
      <div className="PollsPanel">
        <div className="PollsHeader">
          <h2>Polls</h2>
          <button type="button" onClick={props.onClose} aria-label="Close polls">
            ✕
          </button>
        </div>
        <p className="DialogHelp">
          Votes count by reputation: an option's weight is the total reputation of
          the people who chose it.
        </p>
        {isMember && !creating && (
          <Button variant="outlined" onClick={() => setCreating(true)}>
            New poll
          </Button>
        )}
        {!isMember && (
          <p className="DialogHelp">
            {props.api.session ? "Join the tree" : "Sign in and join the tree"} to
            create polls and vote.
          </p>
        )}
        {creating && (
          <NewPoll
            onCancel={() => setCreating(false)}
            onCreate={async (question, options) => {
              await createPoll(props.api, question, options);
              setCreating(false);
              refresh();
            }}
          />
        )}
        {error && <p className="DialogError">{error}</p>}
        {polls === null && <p className="DialogHelp">Loading…</p>}
        {polls?.length === 0 && <p className="DialogHelp">No polls yet.</p>}
        {polls?.map((poll) => (
          <PollCard
            key={poll.id}
            poll={poll}
            canVote={isMember && poll.closedAt === undefined}
            canClose={poll.by === userId && poll.closedAt === undefined}
            onVote={(option) => act(() => votePoll(props.api, poll.id, option))()}
            onClose={act(() => closePoll(props.api, poll.id))}
          />
        ))}
      </div>
    </Drawer>
  );
}

function PollCard(props: {
  poll: PollView;
  canVote: boolean;
  canClose: boolean;
  onVote: (option: number) => void;
  onClose: () => void;
}) {
  const { poll } = props;
  const weights = poll.tally.map((t) => BigInt(t.weight));
  const total = weights.reduce((a, b) => a + b, 0n);
  return (
    <div className="PollCard">
      <div className="PollQuestion">{poll.question}</div>
      <div className="PollMeta">
        by {poll.byName || "someone"}
        {poll.closedAt ? " · closed" : ""}
      </div>
      {poll.options.map((option, i) => {
        const share = total === 0n ? 0 : Number((weights[i] * 1000n) / total) / 10;
        const mine = poll.myVote === i;
        return (
          <div key={option} className={`PollOption${mine ? " PollOptionMine" : ""}`}>
            <div className="PollOptionBar" style={{ width: `${share}%` }} />
            <div className="PollOptionRow">
              <span>
                {mine ? "✓ " : ""}
                {option}
              </span>
              <span className="PollOptionWeight">
                {formatReputation(poll.tally[i].weight)} rep · {poll.tally[i].voters}{" "}
                {poll.tally[i].voters === 1 ? "voter" : "voters"}
              </span>
            </div>
            {props.canVote && !mine && (
              <button type="button" className="PollVoteButton" onClick={() => props.onVote(i)}>
                Vote
              </button>
            )}
          </div>
        );
      })}
      {props.canClose && (
        <button type="button" className="LinkButton" onClick={props.onClose}>
          Close poll
        </button>
      )}
    </div>
  );
}

function NewPoll(props: {
  onCancel: () => void;
  onCreate: (question: string, options: string[]) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");
  const filled = options.map((o) => o.trim()).filter((o) => o !== "");
  return (
    <div className="PollCard">
      <TextField
        fullWidth
        margin="dense"
        label="Question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      {options.map((option, i) => (
        <TextField
          // biome-ignore lint/suspicious/noArrayIndexKey: options have no ids
          key={i}
          fullWidth
          margin="dense"
          size="small"
          label={`Option ${i + 1}`}
          value={option}
          onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
      ))}
      {options.length < 6 && (
        <button type="button" className="LinkButton" onClick={() => setOptions([...options, ""])}>
          + Add option
        </button>
      )}
      {error && <p className="DialogError">{error}</p>}
      <div className="PollActions">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button
          variant="contained"
          disabled={question.trim() === "" || filled.length < 2}
          onClick={async () => {
            try {
              await props.onCreate(question.trim(), filled);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Create poll
        </Button>
      </div>
    </div>
  );
}
