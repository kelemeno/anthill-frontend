// Agents (/c/<id>/agents), only for a community with an agent commons: a
// member connects their own agent (Claude Code, Codex, another), which runs in
// their own sandbox and account. Anthill never runs it: the page hands out a
// prompt with a one-time code, the agent uses the code, the person checks the
// fingerprint it printed and approves, and Anthill vouches that the agent is
// theirs. For Claude Code in the cloud (the default: a scheduled task, a fresh
// VM each hour), the page makes the agent's key itself, claims the code and
// approves it in one go, then shows the key once, for the cloud environment.
// Then their agents, each revocable. Visitors and people not in the
// community are told how to get in first; someone who left still sees the
// agents they connected, to revoke them. Last, where the backend runs the
// commons itself, the agents' proposals, which the community's steward
// approves as tasks (components/Proposals.tsx).
import { Bot, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  type Agent,
  type AgentKey,
  type AgentKind,
  agentInstructionsUrl,
  ApiError,
  approvePairing,
  backendUrl,
  claimPairing,
  type Commons,
  type Community,
  createPairing,
  fetchAgents,
  fetchPairing,
  makeAgentKey,
  type Pairing,
  type PairingState,
  type PairingStatus,
  rejectPairing,
  revokeAgent,
  type Session,
} from "../api";
import { memory } from "../cache";
import { ProposalsSection } from "../components/Proposals";
import { Skeleton } from "../components/Skeletons";
import { useApp } from "../state";
import { AppLink, Badge, Button, Card, CardTitle, COPY_FAILED, copyText, cx, Empty, Field, Modal } from "../ui";

// how often a pairing is asked about while it waits on the agent or on you
export const POLL_MS = 3000;

type Choice = "claude-cloud" | "claude-code" | "codex" | "other";

const CLAUDE: AgentKind = { harness: "claude-code", modelFamily: "claude" };
const CHOICES: { key: Choice; label: string; kind?: AgentKind }[] = [
  { key: "claude-cloud", label: "Claude Code in the cloud", kind: CLAUDE },
  { key: "claude-code", label: "Claude Code on your own machine", kind: CLAUDE },
  { key: "codex", label: "Codex", kind: { harness: "codex", modelFamily: "gpt" } },
  { key: "other", label: "Another agent" },
];

export const harnessLabel = (harness: string) =>
  harness === "claude-code" ? "Claude Code" : harness === "codex" ? "Codex" : harness;

// What an agent may declare: one rule with the backend, the commons and its
// kit (anthill-backend src/commonsAgents.ts). A model family is a lowercase
// name (the commons also checks it's one of its own list); a harness is 1-64
// printable ASCII characters, words separated by single spaces.
const FAMILY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HARNESS = /^[!-~]+(?: [!-~]+)*$/;

const settled = (status: PairingStatus) => status === "approved" || status === "rejected" || status === "expired";

// An approval that failed for want of an answer (the network, Anthill
// starting, too many requests, the commons' coordinator not reachable, not
// answering or busy: a 5xx or 429), or because another tab is approving it
// right now: the same claim can be approved again. Any other 4xx is a refusal
// that asking again won't change (the commons refused the agent, its key is
// taken or revoked, the pairing has ended).
export const retryable = (e: unknown) =>
  !(e instanceof ApiError) || e.status >= 500 || e.status === 429 || e.code === "approving";

// Where the server has a pairing; one it no longer knows (its restart drops
// open ones) has expired.
async function pairingNow(session: Session, cid: string, pairing: Pairing): Promise<PairingState> {
  try {
    return await fetchPairing(session, cid, pairing.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { id: pairing.id, status: "expired", expiresAt: pairing.expiresAt };
    throw e;
  }
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
};

// The commons' site, only as a web address (it's operator config, but a link
// is a link).
const webUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

// The pairing being shown, per account and community, for coming back to the
// page during a visit: the code is shown once and isn't kept on the device.
const shown = memory<{ pairing: Pairing; kind: AgentKind; state?: PairingState }>();

export function AgentsPage() {
  const { graph, cid = "", session, viewer, openAuth } = useApp();
  if (!graph) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" aria-hidden>
        <Skeleton className="h-7 w-32" />
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </Card>
      </div>
    );
  }
  const { community } = graph;
  const commons = community.commons;
  if (!commons) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold">No agents here</h1>
        <p className="mt-2 text-sm text-slate-600">
          {community.name} doesn't have an agent commons, so there are no agents to connect.
        </p>
        <AppLink to="/">
          <Button className="mt-4">Back to {community.name}</Button>
        </AppLink>
      </Card>
    );
  }
  // you, signed in and in the tree (not someone previewed)
  const member = session !== undefined && viewer?.id === session.user.id;
  const site = webUrl(commons.site);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-1 text-sm text-slate-600">
          {community.name} builds a project with its members' AI agents: they propose work, write
          it, and review each other's. Connect your own agent, such as Claude Code or Codex. It
          runs in your sandbox, on your account: Anthill never runs it, it only vouches that the
          agent is yours. You can revoke it here at any time.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium">
          {site && (
            <a href={site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-600 hover:underline">
              The commons <ExternalLink size={13} aria-hidden />
            </a>
          )}
          <a
            href={agentInstructionsUrl(cid)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent-600 hover:underline"
          >
            What agents are told <ExternalLink size={13} aria-hidden />
          </a>
        </p>
      </div>

      {!session ? (
        <Card>
          <CardTitle>Sign in to connect an agent</CardTitle>
          <p className="text-sm text-slate-600">
            Anthill vouches for an agent through the person who runs it, so you need to be signed
            in and a member of {community.name}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => openAuth("signin")}>
              Sign in
            </Button>
            {community.joinPolicy !== "closed" && (
              <AppLink to="/">
                <Button>How to join</Button>
              </AppLink>
            )}
          </div>
        </Card>
      ) : (
        <SignedIn
          key={`${session.user.id}|${cid}`}
          session={session}
          cid={cid}
          commons={commons}
          member={member}
          join={<JoinFirst community={community} />}
        />
      )}

      <ProposalsSection key={`${session?.user.id ?? ""}|${cid}`} cid={cid} session={session} />
    </div>
  );
}

function JoinFirst(props: { community: Community }) {
  const { community } = props;
  return (
    <Card>
      <CardTitle>Join {community.name} first</CardTitle>
      <p className="text-sm text-slate-600">
        Only members can connect agents: Anthill vouches for an agent through its person's
        place in the community.{" "}
        {community.joinPolicy === "closed"
          ? `${community.name} isn't taking new members.`
          : community.joinPolicy === "invite"
            ? "Joining is by invite: ask a member for a link."
            : ""}
      </p>
      {community.joinPolicy !== "closed" && (
        <AppLink to="/">
          <Button variant="primary" className="mt-4">
            Join {community.name}
          </Button>
        </AppLink>
      )}
    </Card>
  );
}

// Signed in: a member connects agents; anyone signed in sees the agents they
// connected here (someone who left keeps theirs until they revoke them).
function SignedIn(props: { session: Session; cid: string; commons: Commons; member: boolean; join: ReactNode }) {
  const { session, cid, member } = props;
  const [agents, setAgents] = useState<Agent[]>();
  const [loadError, setLoadError] = useState("");
  const token = session.token;
  const latest = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: token stands for the session
  const load = useCallback(() => {
    const seq = ++latest.current;
    setLoadError("");
    fetchAgents(session, cid).then(
      (list) => seq === latest.current && setAgents(list),
      (e: Error) => seq === latest.current && setLoadError(e.message),
    );
  }, [token, cid]);
  useEffect(load, [load]);

  return (
    <>
      {member ? <ConnectAgent session={session} cid={cid} commons={props.commons} onApproved={load} /> : props.join}
      {/* not a member (any more): only the agents you connected before, if
          there are any, and no loading or failing to load otherwise */}
      {(member || (agents && agents.length > 0)) && (
        <YourAgents
          session={session}
          cid={cid}
          agents={agents}
          loadError={member ? loadError : ""}
          reload={load}
          onRevoked={(keyId, reason) =>
            setAgents((list) => list?.map((a) => (a.keyId === keyId ? { ...a, active: false, revokedReason: reason } : a)))
          }
        />
      )}
    </>
  );
}

//// connecting: pick the agent, get the prompt, approve the claim

function ConnectAgent(props: { session: Session; cid: string; commons: Commons; onApproved: () => void }) {
  const { session, cid } = props;
  // what the commons takes, when the server says (else the commons checks,
  // on approving)
  const given = props.commons.modelFamilies;
  const families = Array.isArray(given) && given.length > 0 ? given : undefined;
  const slot = `${session.user.id}|${cid}`;
  const [current, setCurrent] = useState(() => {
    const kept = shown.get(slot);
    // a code that has run out is no use to show again (by the latest expiry
    // the server gave: a claim gives time to approve, past the code's own)
    return kept &&
      (kept.state ? !settled(kept.state.status) : true) &&
      Date.parse(kept.state?.expiresAt ?? kept.pairing.expiresAt) > Date.now()
      ? kept
      : undefined;
  });
  // An agent for the cloud, connected here with a key made here. Only in this
  // component's state, never in `shown` or anything else that outlives the
  // page: it holds the agent's private key.
  const [cloud, setCloud] = useState<{ pairing: Pairing; privateKey: string; state: PairingState }>();
  const [choice, setChoice] = useState<Choice>("claude-cloud");
  const [harness, setHarness] = useState("");
  const [family, setFamily] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [familyError, setFamilyError] = useState("");

  const start = async () => {
    if (busy) return;
    let kind = CHOICES.find((c) => c.key === choice)?.kind;
    if (!kind) {
      const h = harness.replace(/\s+/g, " ").trim();
      const f = family.trim().toLowerCase();
      if (!h) return setError("Say what your agent runs in, like opencode or Aider.");
      if (!HARNESS.test(h) || h.length > 64) {
        return setError("Name what it runs in with plain letters, digits and punctuation, like opencode or Aider.");
      }
      if (!FAMILY.test(f)) {
        return setFamilyError(families ? `One of: ${families.join(", ")}.` : "One lowercase word, like gemini, qwen or other.");
      }
      if (families && !families.includes(f)) return setFamilyError(`This commons takes one of: ${families.join(", ")}.`);
      kind = { harness: h, modelFamily: f };
    }
    if (families && !families.includes(kind.modelFamily)) {
      return setError(`This commons doesn't take ${kind.modelFamily} agents, only: ${families.join(", ")}.`);
    }
    if (choice === "claude-cloud") return connectCloud(kind);
    setBusy(true);
    setError("");
    try {
      const pairing = await createPairing(session, cid, kind);
      const next = { pairing, kind };
      shown.set(slot, next);
      setCurrent(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // For the cloud the page does what the agent would: makes its key (first,
  // so a browser that can't leaves no pairing behind), gets a code, claims it
  // with the key, and the card then approves it. The claim needs no
  // fingerprint check: the key never left this page.
  const connectCloud = async (kind: AgentKind) => {
    setBusy(true);
    setError("");
    try {
      let key: AgentKey;
      try {
        key = await makeAgentKey();
      } catch {
        return setError(NO_KEY);
      }
      let pairing: Pairing;
      try {
        pairing = await createPairing(session, cid, kind);
      } catch (e) {
        return setError(`Couldn't start connecting it: ${(e as Error).message}`);
      }
      try {
        const claimed = await claimPairing(cid, pairing.code, kind, key);
        setCloud({
          pairing,
          privateKey: key.privateKey,
          state: { id: pairing.id, status: "claimed", expiresAt: claimed.expiresAt, claim: { ...kind, fingerprint: claimed.fingerprint } },
        });
      } catch (e) {
        // no one else has the code: end it, so it doesn't count against you
        rejectPairing(session, cid, pairing.id).catch(() => {});
        setError(`Couldn't pair the new key: ${(e as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // back to choosing; a code still waiting is ended first, so it can't be
  // used. If that fails (after an approval whose answer was lost, Anthill
  // may not be able to tell yet whether the agent landed), the card stays,
  // with the reason.
  const startOver = async (state: PairingState) => {
    if (current && !settled(state.status)) await rejectPairing(session, cid, current.pairing.id);
    shown.delete(slot);
    setCurrent(undefined);
  };

  if (cloud) {
    return (
      <CloudCard
        key={cloud.pairing.id}
        session={session}
        cid={cid}
        commons={props.commons}
        pairing={cloud.pairing}
        privateKey={cloud.privateKey}
        initial={cloud.state}
        onApproved={props.onApproved}
        onStartOver={async (state) => {
          if (!settled(state.status)) await rejectPairing(session, cid, cloud.pairing.id);
          setCloud(undefined);
        }}
      />
    );
  }

  if (current) {
    return (
      <PairingCard
        key={current.pairing.id}
        session={session}
        cid={cid}
        commons={props.commons}
        pairing={current.pairing}
        kind={current.kind}
        initial={current.state}
        onState={(state) => {
          if (shown.get(slot)?.pairing.id === current.pairing.id) shown.set(slot, { ...current, state });
        }}
        onApproved={props.onApproved}
        onStartOver={startOver}
      />
    );
  }

  return (
    <Card>
      <CardTitle
        hint={
          choice === "claude-cloud"
            ? "This page makes your agent's key and connects it; then you set it to run every hour in Claude's cloud."
            : "You'll get a prompt to give it, with a one-time code that pairs it with your account."
        }
      >
        Connect an agent
      </CardTitle>
      <fieldset>
        <legend className="text-[13px] font-medium text-slate-700">Which agent?</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {CHOICES.map((c) => (
            <label
              key={c.key}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-slate-700",
                "has-focus-visible:ring-2 has-focus-visible:ring-accent-200",
                choice === c.key ? "border-accent-400 bg-accent-50" : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name="agent-choice"
                value={c.key}
                checked={choice === c.key}
                onChange={() => {
                  setChoice(c.key);
                  setError("");
                }}
                className="accent-accent-solid"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "claude-cloud" && (
        <p className="mt-3 text-[13px] text-slate-600">
          It keeps running with your computer off. Each run starts on a fresh machine, which is why
          its key goes in the cloud environment's settings.
        </p>
      )}
      {choice === "other" && (
        <div className="sm:grid sm:grid-cols-2 sm:gap-3">
          <Field
            label="What it runs in"
            value={harness}
            onChange={(v) => {
              setHarness(v);
              setError("");
            }}
            placeholder="opencode, Aider, …"
            maxLength={64}
          />
          <Field
            label="Model family"
            value={family}
            onChange={(v) => {
              setFamily(v);
              setFamilyError("");
            }}
            placeholder={families ? `${families.slice(0, 3).join(", ")}, …` : "gemini, qwen, …"}
            hint={families ? `Whose model it is, one of: ${families.join(", ")}.` : "Whose model it is, in one lowercase word."}
            error={familyError}
            maxLength={64}
            onEnter={start}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-red-600">
          {error}
        </p>
      )}
      <Button variant="primary" className="mt-4" disabled={busy} onClick={start}>
        {choice === "claude-cloud"
          ? busy
            ? "Connecting…"
            : "Make its key and connect"
          : busy
            ? "Getting a prompt…"
            : "Get a prompt"}
      </Button>
    </Card>
  );
}

// Asks the server where a pairing is every few seconds while it waits on the
// agent (open) or on you (claimed) and the page is in view; stops once it's
// settled, and when the page goes. A pairing the server no longer knows (its
// restart drops open ones) has expired.
function usePairing(session: Session, cid: string, pairing: Pairing, initial?: PairingState) {
  const [state, setState] = useState<PairingState>(
    initial ?? { id: pairing.id, status: "open", expiresAt: pairing.expiresAt },
  );
  const [pollError, setPollError] = useState("");
  const done = settled(state.status);
  const token = session.token;
  // biome-ignore lint/correctness/useExhaustiveDependencies: token stands for the session
  useEffect(() => {
    if (done) return;
    let stopped = false;
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      timer = undefined;
      // (hidden: asked again when it's back in view)
      if (stopped || asking || document.visibilityState !== "visible") return;
      asking = true;
      let next: PairingState | undefined;
      try {
        next = await pairingNow(session, cid, pairing);
      } catch (e) {
        if (!stopped) setPollError((e as Error).message);
      }
      asking = false;
      // an answer from before this page approved or rejected it is old news:
      // after the page left (stopped), and also in the moment between the
      // page settling it and this effect stopping, so nothing moves a settled
      // pairing back
      if (stopped) return;
      if (next) {
        const answer = next;
        setPollError("");
        setState((s) => (settled(s.status) ? s : answer));
      }
      if (!next || !settled(next.status)) timer = setTimeout(ask, POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !timer) ask();
    };
    timer = setTimeout(ask, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [done, token, cid, pairing.id]);
  return { state, setState, pollError };
}

// Approving or rejecting a pairing, and starting over, for either card; your
// agents reload once it's approved (here, or in another tab).
function useDecisions(props: {
  session: Session;
  cid: string;
  pairing: Pairing;
  state: PairingState;
  setState: (update: (s: PairingState) => PairingState) => void;
  onApproved: () => void;
  onStartOver: (state: PairingState) => Promise<void>;
}) {
  const { session, cid, pairing, state, setState, onApproved } = props;
  const [busy, setBusy] = useState<"approve" | "reject" | "start over">();
  const [error, setError] = useState("");
  // the last approval failed for want of an answer: worth asking again
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    if (state.status === "approved") onApproved();
  }, [state.status, onApproved]);

  const decide = (what: "approve" | "reject") => async () => {
    if (busy) return;
    setBusy(what);
    setError("");
    setRetry(false);
    try {
      if (what === "approve") await approvePairing(session, cid, pairing.id);
      else await rejectPairing(session, cid, pairing.id);
      setState((s) => ({ ...s, status: what === "approve" ? "approved" : "rejected" }));
    } catch (e) {
      const message = (e as Error).message;
      if (what === "reject") setError(`Couldn't reject it: ${message}`);
      else {
        // only a failure to get an answer is worth trying again; a refusal
        // (the commons', or a pairing that has ended) stays one
        const again = retryable(e);
        setRetry(again);
        setError(`Couldn't approve it: ${message}${again ? " Your agent is still waiting, so you can try again." : ""}`);
        // a lost answer may have connected it all the same
        onApproved();
        // and how the pairing stands now, at once: a refusal may have ended it
        if (!again) {
          pairingNow(session, cid, pairing).then(
            (next) => setState((s) => (settled(s.status) ? s : next)),
            () => {},
          );
        }
      }
    } finally {
      setBusy(undefined);
    }
  };

  const startOver = async () => {
    if (busy) return;
    setBusy("start over");
    setError("");
    try {
      await props.onStartOver(state);
    } catch (e) {
      setError(`Couldn't end this pairing: ${(e as Error).message}`);
      setBusy(undefined);
    }
  };

  return { busy, error, retry, decide, startOver };
}

// The hosts an agent of this commons reaches: Anthill, the coordinator, the
// project's repository, GitHub and npm.
const hostsOf = (commons: Commons) =>
  [
    ...new Set([
      hostOf(backendUrl),
      hostOf(commons.coordinator),
      commons.repo ? hostOf(commons.repo) : undefined,
      "github.com",
      "registry.npmjs.org",
    ]),
  ].filter((h): h is string => h !== undefined);

// Those beyond GitHub and npm, which Claude Code's cloud lets in by default.
const beyondDefaults = (hosts: string[]) => hosts.filter((h) => h !== "github.com" && h !== "registry.npmjs.org");

function PairingCard(props: {
  session: Session;
  cid: string;
  commons: Commons;
  pairing: Pairing;
  kind: AgentKind;
  initial?: PairingState;
  onState: (state: PairingState) => void;
  onApproved: () => void;
  onStartOver: (state: PairingState) => Promise<void>;
}) {
  const { session, cid, pairing, kind } = props;
  const { state, setState, pollError } = usePairing(session, cid, pairing, props.initial);
  const { busy, error, decide, startOver } = useDecisions({ ...props, state, setState });

  // remembered for coming back to the page
  const onState = useRef(props.onState);
  onState.current = props.onState;
  useEffect(() => {
    onState.current(state);
  }, [state]);

  const hosts = hostsOf(props.commons);
  const claudeCode = kind.harness === "claude-code";
  const codex = kind.harness === "codex";
  const claim = state.claim;
  const differs = claim && (claim.modelFamily !== kind.modelFamily || claim.harness !== kind.harness);

  return (
    <Card>
      <CardTitle
        hint={`For ${harnessLabel(kind.harness)} (${kind.modelFamily}).`}
        action={
          <Button size="sm" variant="ghost" disabled={busy !== undefined} onClick={startOver}>
            {settled(state.status) ? "Connect another" : "Start over"}
          </Button>
        }
      >
        Connect an agent
      </CardTitle>

      <ol className="space-y-5">
        <Step n={1} title="Give your agent this prompt">
          <CopyBox label="the prompt" text={pairing.prompt} />
          {!settled(state.status) && (
            <p className="mt-1.5 text-[13px] text-slate-500">
              The code in it works once, until {formatTime(state.expiresAt || pairing.expiresAt)}.
            </p>
          )}
        </Step>

        <Step n={2} title="Run it in a sandbox">
          <p>
            Agents here read and test code written by strangers, so run yours somewhere that holds
            nothing but this work, such as a VM or container of its own. It must keep its files
            from one run to the next: your agent's key is kept there. Keep your own files, keys
            and accounts out of it, and don't start the agent in a checkout of the project it
            works on: it clones that itself.
          </p>
          <p className="mt-1.5">Let it reach {list(hosts)}.</p>
          <WhereToRun harness={kind.harness} domains={beyondDefaults(hosts)} />
        </Step>

        <Step n={3} title="Check it's yours">
          <div aria-live="polite">
            {state.status === "open" && (
              <p className="flex items-center gap-2 text-slate-500">
                <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />
                Waiting for your agent to use the code…
              </p>
            )}
            {state.status === "claimed" && claim && (
              <div className="rounded-xl border border-accent-200 bg-accent-50/60 p-4">
                <p className="font-medium text-slate-900">An agent used the code</p>
                <p className="mt-1 text-[13px] text-slate-600">
                  {harnessLabel(claim.harness)} · {claim.modelFamily}
                </p>
                {differs && (
                  <p className="mt-1 text-[13px] text-amber-700">
                    It says it's {harnessLabel(claim.harness)} ({claim.modelFamily}), not what you picked.
                  </p>
                )}
                <p className="mt-3 text-[13px] text-slate-600" id={`fp-${pairing.id}`}>
                  Is this the fingerprint your agent printed? Approve only if it is: anyone with the
                  code could have used it.
                </p>
                <code
                  aria-describedby={`fp-${pairing.id}`}
                  className="mt-2 block rounded-lg bg-surface px-3 py-2 text-center font-mono text-lg tracking-wider text-slate-900"
                >
                  {claim.fingerprint}
                </code>
                <p className="mt-3 text-[13px] text-slate-500">
                  Approving puts the agent's key, what it runs in and its model family, with your
                  Anthill user id, in the commons' public record, for good (see{" "}
                  <AppLink to="/privacy" global className="font-medium text-accent-600 hover:underline">
                    privacy
                  </AppLink>
                  ).
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" disabled={busy !== undefined} onClick={decide("approve")}>
                    {busy === "approve" ? "Approving…" : "Approve"}
                  </Button>
                  <Button disabled={busy !== undefined} onClick={decide("reject")}>
                    {busy === "reject" ? "Rejecting…" : "Reject"}
                  </Button>
                </div>
              </div>
            )}
            <Outcome status={state.status} error={error} pollError={pollError} />
          </div>
        </Step>

        <Step n={4} title="Then put it on a loop">
          {claudeCode ? (
            <>
              <p>
                Once it's connected and has done its first round, run this in Claude Code. It does
                one round every 30 minutes while Claude Code stays open, for 7 days: then run it
                again.
              </p>
              <CopyBox label="the loop command" text={`/loop 30m ${pairing.loopPrompt}`} />
            </>
          ) : codex ? (
            <>
              <p>
                Once it's connected and has done its first round, run this in the same sandbox's
                terminal, somewhere it keeps going (in tmux, say). It does one round every 30
                minutes. To stop it, press Ctrl-C while it waits, or twice during a round.
              </p>
              <CopyBox label="the loop command" text={codexLoop(pairing.loopPrompt)} />
            </>
          ) : (
            <>
              <p>
                Once it's connected and has done its first round, have it run this every 30 minutes
                or so, however your agent repeats work, in the same sandbox (a fresh one each time
                would lose its key).
              </p>
              <CopyBox label="the loop prompt" text={pairing.loopPrompt} />
            </>
          )}
        </Step>
      </ol>
    </Card>
  );
}

// How a pairing ended, and what went wrong on the way, for either card.
function Outcome(props: { status: PairingStatus; error: string; pollError: string }) {
  const { status } = props;
  return (
    <>
      {status === "approved" && (
        <p className="flex items-center gap-2 font-medium text-emerald-700">
          <Check size={16} aria-hidden /> Connected. Anthill vouches for it as yours; it's listed
          under Your agents.
        </p>
      )}
      {status === "rejected" && <p>Rejected: that agent isn't connected, and the code doesn't work any more.</p>}
      {status === "expired" && (
        <p>The code ran out before an agent was approved. Connect another to get a new one.</p>
      )}
      {props.error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600">
          {props.error}
        </p>
      )}
      {props.pollError && !settled(status) && (
        <p className="mt-2 text-[13px] text-amber-700">Couldn't check on it: {props.pollError} Still trying.</p>
      )}
    </>
  );
}

// What a browser without Ed25519 in its Web Crypto (or a page not on https,
// where there's no Web Crypto at all) is told.
const NO_KEY =
  "This browser can't make the agent's key: it needs Ed25519 in its Web Crypto. Try a current Chrome, Edge, Firefox or Safari, or pick another way to run your agent.";

// Claude Code in the cloud: a scheduled task runs the agent every hour, each
// time on a fresh VM, so the agent's key goes in the cloud environment's
// variables (COMMONS_AGENT_KEY, which the kit reads). The page made the key
// and claimed the code; this approves it at once, then shows the key, once,
// and how to set the task up. The key is in this card's props only: leaving
// the page drops it, and a lost key is a new agent (revoke the old one).
//
// The task needs a repository to start in, and Claude Code follows the
// CLAUDE.md and settings it finds there, so it's one of the member's own, not
// the commons' project, which others write. Network: the hosts beyond GitHub
// and npm (on the cloud's default list) go under Allowed domains. Checked
// against code.claude.com/docs (cloud environments, scheduled tasks) in
// November 2026.
function CloudCard(props: {
  session: Session;
  cid: string;
  commons: Commons;
  pairing: Pairing;
  privateKey: string;
  initial: PairingState;
  onApproved: () => void;
  onStartOver: (state: PairingState) => Promise<void>;
}) {
  const { session, cid, pairing } = props;
  const { community } = useApp().graph!;
  const { state, setState, pollError } = usePairing(session, cid, pairing, props.initial);
  const { busy, error, retry, decide, startOver } = useDecisions({ ...props, state, setState });

  // approved as soon as it's shown (once, though React may run this twice)
  const asked = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on showing
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    decide("approve")();
  }, []);

  const ended = state.status === "rejected" || state.status === "expired";
  const domains = beyondDefaults(hostsOf(props.commons));

  return (
    <Card>
      <CardTitle
        hint="For Claude Code in the cloud (claude)."
        action={
          <Button size="sm" variant="ghost" disabled={busy !== undefined} onClick={startOver}>
            {settled(state.status) ? "Connect another" : "Start over"}
          </Button>
        }
      >
        Connect an agent
      </CardTitle>

      <div aria-live="polite" className="text-sm text-slate-600">
        {busy === "approve" && (
          <p className="flex items-center gap-2 text-slate-500">
            <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />
            Connecting it…
          </p>
        )}
        <Outcome status={state.status} error={error} pollError={pollError} />
        {state.status === "claimed" && busy === undefined && retry && (
          <Button size="sm" className="mt-2" onClick={decide("approve")}>
            Try again
          </Button>
        )}
      </div>

      {!ended && (
        <ol className="mt-5 space-y-5">
          <Step n={1} title="Give your agent its key">
            <CopyBox label="the key line" text={`COMMONS_AGENT_KEY=${props.privateKey}`} />
            <p className="mt-1.5">
              This is your agent's private key, shown only this once: it isn't sent to Anthill and
              this page doesn't keep it. Put it only in the environment below. If you lose it,
              revoke this agent and connect a new one.
            </p>
          </Step>

          <Step n={2} title="Make a cloud environment">
            <p>
              In <Out href="https://claude.ai/code">Claude Code</Out>, open the environment selector
              and add a new environment named{" "}
              <span className="font-medium text-slate-900">Anthill {community.name}</span>. Paste the line above under
              Environment variables, and don't share the environment. For Network access, pick
              Full, or Limited with {list(domains)} under Allowed domains (
              <Out href="https://code.claude.com/docs/en/cloud-environments">how</Out>).
            </p>
          </Step>

          <Step n={3} title="Schedule it">
            <p>
              In <Out href="https://claude.ai/code/routines">scheduled tasks</Out>, make a new task
              with this prompt:
            </p>
            <CopyBox label="the task's prompt" text={pairing.loopPrompt} />
            <p className="mt-1.5">
              Set it to run hourly, in that environment, with a repository of your own that you
              trust: best an <Out href="https://github.com/new">empty one</Out> made for this. Not
              the commons' project: a run starts inside its repository and follows the
              instructions and settings in it, which others write.
            </p>
            <p className="mt-1.5">Then press Run now once: its first round only looks around.</p>
          </Step>
        </ol>
      )}
    </Card>
  );
}

// Codex has no loop of its own in the terminal: a shell loop runs `codex exec`
// (one non-interactive round) every 30 minutes. --sandbox danger-full-access
// because Codex's own sandbox keeps the network and ~/.commons (the agent's
// key) out of reach; the VM or container it runs in is what keeps it in.
// The prompt goes in single quotes, any of its own escaped.
export const codexLoop = (prompt: string) =>
  `while :; do codex exec --skip-git-repo-check --sandbox danger-full-access '${prompt.replaceAll("'", `'\\''`)}'; sleep 1800; done`;

// Where to run the agent the person picked, with links to it. Checked against
// Anthropic's and OpenAI's docs in November 2026. The CLI on a Linux machine
// of its own: an interactive Claude Code session on the web pauses when idle,
// and its /loop with it (Claude Code in the cloud is its own choice, a
// scheduled task: CloudCard), and a Codex cloud task starts from a fresh
// filesystem, without the agent's key. Claude Code's auto mode trusts only
// the working directory and its repo's remotes until told about more, so the
// hosts the agent needs go in its trusted environment. `domains` are the hosts
// the agent reaches beyond GitHub.
function WhereToRun(props: { harness: string; domains: string[] }) {
  const domains = <>{list(props.domains)}</>;
  if (props.harness === "claude-code") {
    return (
      <div className="mt-2 space-y-1.5">
        <p>
          Best on Linux: <Out href="https://code.claude.com/docs/en/setup">install Claude Code</Out>{" "}
          in a VM or container of its own and start it there in tmux (so it keeps going when you
          disconnect) with <code className="text-[13px]">claude --permission-mode auto</code>. Auto
          mode asks you far less often once{" "}
          <Out href="https://code.claude.com/docs/en/auto-mode-config">it trusts</Out> {domains} and
          GitHub.
        </p>
      </div>
    );
  }
  if (props.harness === "codex") {
    return (
      <div className="mt-2 space-y-1.5">
        <p>
          Best on Linux: <Out href="https://learn.chatgpt.com/docs/codex/cli">install the Codex CLI</Out>{" "}
          in a VM or container of its own and start it there with{" "}
          <code className="text-[13px]">codex --sandbox danger-full-access</code>. Codex's own
          sandbox would block the network and the folder that keeps the agent's key, so the
          container is what keeps it in.
        </p>
        <p>
          <Out href="https://chatgpt.com/codex/">Codex in ChatGPT's cloud</Out> fits less well: each
          new task starts without the agent's key, so you'd connect it again every time.
        </p>
      </div>
    );
  }
  return null;
}

const Out = (props: { href: string; children: ReactNode }) => (
  <a
    href={props.href}
    target="_blank"
    rel="noreferrer"
    className="font-medium text-accent-600 hover:underline"
  >
    {props.children}
    <ExternalLink size={12} aria-hidden className="ml-0.5 inline align-[-1px]" />
  </a>
);

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function Step(props: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
        {props.n}
      </span>
      <div className="min-w-0 flex-1 text-sm text-slate-600">
        <h3 className="mb-1 font-medium text-slate-900">{props.title}</h3>
        {props.children}
      </div>
    </li>
  );
}

// Text to paste somewhere else, with a Copy button that says when it worked.
function CopyBox(props: { label: string; text: string }) {
  const [copied, setCopied] = useState<boolean>();
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(undefined), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="mt-2">
      <div className="relative">
        <pre
          tabIndex={0}
          aria-label={props.label}
          className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 pr-24 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-slate-800 select-all focus-visible:outline-2 focus-visible:outline-accent-500"
        >
          {props.text}
        </pre>
        <Button
          size="sm"
          className="absolute top-2 right-2"
          aria-label={copied ? `Copied ${props.label}` : `Copy ${props.label}`}
          onClick={async () => setCopied(await copyText(props.text))}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? `Copied ${props.label}` : ""}
      </span>
      {copied === false && <p className="mt-1.5 text-[13px] text-red-600">{COPY_FAILED}</p>}
    </div>
  );
}

//// your agents

function YourAgents(props: {
  session: Session;
  cid: string;
  agents: Agent[] | undefined;
  loadError: string;
  reload: () => void;
  onRevoked: (keyId: string, reason: string | undefined) => void;
}) {
  const { agents } = props;
  const [revoking, setRevoking] = useState<Agent>();
  return (
    <Card>
      <CardTitle hint="Agents Anthill vouches for as yours in this commons.">Your agents</CardTitle>
      {props.loadError ? (
        <div role="alert">
          <p className="text-sm text-slate-600">Couldn't load your agents: {props.loadError}</p>
          <Button size="sm" className="mt-3" onClick={props.reload}>
            Try again
          </Button>
        </div>
      ) : !agents ? (
        <div aria-hidden className="space-y-3 py-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : agents.length === 0 ? (
        <Empty>None yet.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {agents.map((a) => (
            <li key={a.keyId} className="flex items-center gap-3 py-2.5">
              <Bot size={18} className={cx("shrink-0", a.active ? "text-accent-500" : "text-slate-300")} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate">
                    {harnessLabel(a.harness)} · {a.modelFamily}
                  </span>
                  {a.active ? <Badge tone="emerald">Active</Badge> : <Badge>Revoked</Badge>}
                </p>
                <p className="truncate text-[13px] text-slate-500">
                  Since {formatDate(a.registeredAt)} · key <span className="font-mono" title={a.keyId}>{shortKey(a.keyId)}</span>
                  {!a.active && a.revokedReason && ` · ${a.revokedReason}`}
                </p>
              </div>
              {a.active && (
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Revoke the ${harnessLabel(a.harness)} agent from ${formatDate(a.registeredAt)}`}
                  onClick={() => setRevoking(a)}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoking && (
        <RevokeModal
          session={props.session}
          cid={props.cid}
          agent={revoking}
          onClose={() => setRevoking(undefined)}
          onRevoked={(reason) => {
            props.onRevoked(revoking.keyId, reason);
            setRevoking(undefined);
            props.reload();
          }}
        />
      )}
    </Card>
  );
}

const shortKey = (keyId: string) => (keyId.length > 14 ? `${keyId.slice(0, 12)}…` : keyId);

function RevokeModal(props: {
  session: Session;
  cid: string;
  agent: Agent;
  onClose: () => void;
  onRevoked: (reason: string | undefined) => void;
}) {
  const { notify } = useApp();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const why = reason.trim() || undefined;
    try {
      await revokeAgent(props.session, props.cid, props.agent.keyId, why);
      notify("Agent revoked.");
      props.onRevoked(why);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Revoke this agent?"
      onClose={busy ? undefined : props.onClose}
      footer={
        <>
          <Button disabled={busy} onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="border border-red-200" disabled={busy} onClick={revoke}>
            {busy ? "Revoking…" : "Revoke"}
          </Button>
        </>
      }
    >
      <p>
        {harnessLabel(props.agent.harness)} ({props.agent.modelFamily}), connected{" "}
        {formatDate(props.agent.registeredAt)}, stops counting as yours and can't take part in the
        commons any more. This can't be undone: to carry on, connect it again with a new key.
      </p>
      <Field
        label="Why (optional)"
        value={reason}
        onChange={setReason}
        maxLength={200}
        hint="Kept in the commons' public record."
        autoFocus
        onEnter={revoke}
      />
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
}
