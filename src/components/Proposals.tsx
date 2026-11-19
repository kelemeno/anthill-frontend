// The Agents page's Proposals, for a commons the backend runs itself: what
// the agents propose (a title and evidence, written by the agent), and what
// became of each, open, approved and waiting for the commons, or a task.
// The community's steward (whoever may change its settings) approves a
// proposal as a task: its ring (preselected from the commons' ring rules and
// the files the evidence points at), a size estimate, the paths of the
// acceptance tests and the spec author, whose agent writes those tests. The
// commons makes it a task on its next pass (within a minute); until then the
// approval can be declined. One the commons won't take (the server says why,
// or it's still waiting after a few minutes) says so, and isn't asked about
// again and again. Everyone else sees the list read-only. A community whose
// commons runs elsewhere (the server answers 404) shows nothing here.
import { Check, Clock, FileText, TriangleAlert } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  approveProposal,
  declineProposal,
  type Evidence,
  fetchProposals,
  type PersonRef,
  type Proposal,
  type ProposalTask,
  type Proposals,
  type Ring,
  type RingRule,
  type Session,
} from "../api";
import { ringsOf } from "../rings";
import { useApp } from "../state";
import { Badge, Button, Card, CardTitle, cx, Empty, FIELD_FOCUS, Field } from "../ui";
import { Skeleton } from "./Skeletons";

// how often the list is asked for again while an approval waits for the
// commons (its coordinator passes every 30 seconds) and the page is in view
export const PROPOSALS_POLL_MS = 15_000;
// how many times an approval is asked about before it's taken to be stuck
// (two minutes: four of the coordinator's passes)
export const PROPOSALS_POLL_LIMIT = 8;

// The rings. Which files are in which is the repository's own rules
// (.commons/rules.json, as the ledger holds them), not these names.
export const RINGS: { ring: Ring; label: string; explain: string }[] = [
  { ring: 0, label: "Ring 0: kernel", explain: "Reviewed most carefully, with the highest stake to claim." },
  { ring: 1, label: "Ring 1: logic", explain: "Everything the rules don't put in ring 0 or 2." },
  { ring: 2, label: "Ring 2: interface", explain: "Code the rules keep away from any state." },
];

// The commons' limits for a task (the server checks the same).
export const MAX_SIZE = 100_000;
export const MAX_TESTS = 100;
const MAX_PATH = 512;

// Why a test path isn't one the commons takes, or undefined: relative to the
// repository, / between folders, no empty, . or .. parts, no backslashes.
export function testPathProblem(path: string): string | undefined {
  if (path.length > MAX_PATH) return `${path.slice(0, 40)}… is longer than ${MAX_PATH} characters.`;
  if (path.includes("\\") || /\p{Cc}/u.test(path)) return `${path} has a backslash or a control character: use / between folders.`;
  if (path.startsWith("/")) return `${path} starts with /: give the path from the repository's root, like test/login.test.ts.`;
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) return `${path} has an empty, . or .. part.`;
  return undefined;
}

// The lines of the acceptance tests box: the paths, or why they won't do.
export function parseTestPaths(text: string): { paths: string[] } | { error: string } {
  const paths = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (paths.length === 0) return { error: "Name at least one path for the acceptance tests, like test/login.test.ts." };
  if (paths.length > MAX_TESTS) return { error: `At most ${MAX_TESTS} test files.` };
  for (const p of paths) {
    const problem = testPathProblem(p);
    if (problem) return { error: problem };
  }
  const twice = paths.find((p, i) => paths.indexOf(p) !== i);
  if (twice) return { error: `${twice} is there twice.` };
  return { paths };
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const EVIDENCE_LABEL: Record<Evidence["kind"], string> = {
  failingTest: "Failing test",
  diagnostic: "Diagnostic",
  location: "Location",
  other: "Evidence",
};

const ringLabel = (ring: number) => RINGS.find((r) => r.ring === ring)?.label ?? "No ring";

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const agentOf = (p: PersonRef) => `${p.name || p.id}'s agent`;

// Why the commons won't make a pending approval a task: what the server
// says, or what's plainly missing from it (one written by hand on the
// server), or undefined.
export function pendingProblem(task: ProposalTask): string | undefined {
  if (task.status !== "pending") return undefined;
  if (task.problem) return task.problem;
  const missing = [
    ...(task.ring === 0 || task.ring === 1 || task.ring === 2 ? [] : ["ring"]),
    ...(task.acceptanceTestPaths.length === 0 ? ["acceptance tests"] : []),
    ...(task.specAuthor.id ? [] : ["spec author"]),
  ];
  return missing.length > 0 ? `It has no ${list(missing)}, so the commons can't make it a task.` : undefined;
}

export function ProposalsSection(props: { cid: string; session?: Session }) {
  const { cid, session } = props;
  const [data, setData] = useState<Proposals>();
  // the server has no commons of its own here: nothing to show
  const [absent, setAbsent] = useState(false);
  const [loadError, setLoadError] = useState("");
  // how many times each pending approval (by task id) has been read back
  // still pending: past PROPOSALS_POLL_LIMIT it's stuck, and not asked about
  const [reads, setReads] = useState<Record<string, number>>({});
  const latest = useRef(0);
  const token = session?.token;
  // biome-ignore lint/correctness/useExhaustiveDependencies: token stands for the session
  const load = useCallback(() => {
    const seq = ++latest.current;
    fetchProposals(cid, session).then(
      (next) => {
        if (seq !== latest.current) return;
        setLoadError("");
        setAbsent(false);
        setData(next);
        setReads((before) => {
          const after: Record<string, number> = {};
          for (const p of next.proposals) {
            if (p.task?.status === "pending") after[p.task.id] = (before[p.task.id] ?? -1) + 1;
          }
          return after;
        });
      },
      (e: Error) => {
        if (seq !== latest.current) return;
        if (e instanceof ApiError && e.status === 404) setAbsent(true);
        else setLoadError(e.message);
      },
    );
  }, [cid, token]);
  useEffect(load, [load]);

  // asked again while an approval waits for the commons, in view only, and
  // not for one the commons won't take or that's stuck
  const stuck = new Set(
    (data?.proposals ?? []).flatMap((p) =>
      p.task?.status === "pending" && !pendingProblem(p.task) && (reads[p.task.id] ?? 0) >= PROPOSALS_POLL_LIMIT ? [p.task.id] : [],
    ),
  );
  const waiting =
    data?.proposals.some((p) => p.task?.status === "pending" && !pendingProblem(p.task) && !stuck.has(p.task.id)) ?? false;
  useEffect(() => {
    if (!waiting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        timer = undefined;
        if (document.visibilityState === "visible") load();
        else schedule();
      }, PROPOSALS_POLL_MS);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waiting, data, load]);

  if (absent) return null;
  const replace = (next: Proposal) =>
    setData((d) => d && { ...d, proposals: d.proposals.map((p) => (p.id === next.id ? next : p)) });
  const steward = data?.canApprove === true && session !== undefined;

  return (
    <Card aria-labelledby="proposals-title">
      <CardTitle
        hint={
          steward
            ? "What agents here propose. Approve the ones worth doing as tasks: the spec author's agent writes the acceptance tests, then an agent implements it."
            : "What agents here propose. The community's founder decides which become tasks: the spec author's agent writes the acceptance tests, then an agent implements it."
        }
      >
        <span id="proposals-title">Proposals</span>
      </CardTitle>
      {!data && loadError ? (
        <div role="alert">
          <p className="text-sm text-slate-600">Couldn't load the proposals: {loadError}</p>
          <Button size="sm" className="mt-3" onClick={load}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <div aria-hidden className="space-y-3 py-1">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : (
        <ProposalGroups data={data} cid={cid} session={steward ? session : undefined} stuck={stuck} onChange={replace} reload={load} />
      )}
      {data && loadError && (
        <p className="mt-3 text-[13px] text-amber-700">Couldn't check for changes: {loadError}</p>
      )}
    </Card>
  );
}

function ProposalGroups(props: {
  data: Proposals;
  cid: string;
  // set for the steward
  session?: Session;
  // pending approvals (task ids) still not tasks after a few minutes
  stuck: Set<string>;
  onChange: (p: Proposal) => void;
  reload: () => void;
}) {
  const { data } = props;
  const open = data.proposals.filter((p) => !p.task);
  const pending = data.proposals.filter((p) => p.task?.status === "pending");
  const created = data.proposals.filter((p) => p.task?.status === "created");
  const item = (p: Proposal) => (
    <ProposalItem
      key={p.id}
      proposal={p}
      cid={props.cid}
      session={props.session}
      owners={data.owners ?? []}
      youAreOwner={data.youAreOwner === true}
      rings={Array.isArray(data.rings) ? data.rings : undefined}
      stuck={p.task !== null && props.stuck.has(p.task.id)}
      onChange={props.onChange}
      reload={props.reload}
    />
  );
  return (
    <>
      {data.problem && (
        <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.problem}
        </p>
      )}
      {data.proposals.length === 0 ? (
        <Empty>No proposals yet. Agents propose work as they find it.</Empty>
      ) : (
        <div className="space-y-5">
          <Group title="Open" count={open.length} empty="None open: every proposal is a task or waiting to be one.">
            {open.map(item)}
          </Group>
          {pending.length > 0 && (
            <Group title="Approved, waiting for the commons" count={pending.length}>
              {pending.map(item)}
            </Group>
          )}
          {created.length > 0 && (
            <Group title="Tasks" count={created.length}>
              {created.map(item)}
            </Group>
          )}
        </div>
      )}
      {data.total > data.proposals.length && (
        <p className="mt-3 text-[13px] text-slate-500">
          The newest {data.proposals.length} of {data.total} proposals.
        </p>
      )}
    </>
  );
}

function Group(props: { title: string; count: number; empty?: string; children: ReactNode }) {
  return (
    <section aria-label={props.title}>
      <h3 className="text-[13px] font-semibold tracking-wide text-slate-500 uppercase">
        {props.title} <span className="font-normal">({props.count})</span>
      </h3>
      {props.count === 0 && props.empty ? (
        <p className="mt-1.5 text-[13px] text-slate-500">{props.empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100">{props.children}</ul>
      )}
    </section>
  );
}

function ProposalItem(props: {
  proposal: Proposal;
  cid: string;
  session?: Session;
  owners: PersonRef[];
  youAreOwner: boolean;
  rings?: RingRule[];
  // pending, and still not a task after a few minutes
  stuck: boolean;
  onChange: (p: Proposal) => void;
  reload: () => void;
}) {
  const { proposal: p, session } = props;
  const { notify } = useApp();
  const [approving, setApproving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const author = p.author.owner ? `${p.author.owner.name || "A member"}'s agent` : "An agent";
  const task = p.task;
  const problem = task ? pendingProblem(task) : undefined;
  const attention = problem !== undefined || (task?.status === "pending" && props.stuck);

  const decline = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const { proposal } = await declineProposal(session, props.cid, p.id);
      props.onChange(proposal);
      notify(proposal.task ? "It's already a task: the commons took it before it could be declined." : "Approval taken back: it's open again.");
    } catch (e) {
      setError(`Couldn't decline it: ${(e as Error).message}`);
      // it may have become a task meanwhile
      props.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <FileText size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
            <span className="break-words">{p.title || "(untitled)"}</span>
            {task?.status === "pending" &&
              (attention ? (
                <Badge tone="amber">
                  <TriangleAlert size={12} aria-hidden /> Needs attention
                </Badge>
              ) : (
                <Badge tone="amber">
                  <Clock size={12} aria-hidden /> Pending
                </Badge>
              ))}
            {task?.status === "created" && (
              <Badge tone="emerald">
                <Check size={12} aria-hidden /> Task{task.state ? `: ${task.state}` : ""}
              </Badge>
            )}
          </p>
          <p className="text-[13px] text-slate-500">
            {author}
            {p.author.modelFamily ? ` (${p.author.modelFamily})` : ""}
            {formatDate(p.proposedAt) && ` · ${formatDate(p.proposedAt)}`}
          </p>
          {p.evidence.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[13px] text-slate-600">
              {p.evidence.map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: evidence has no id and never reorders
                <li key={i} className="break-words">
                  <span className="font-medium text-slate-700">{EVIDENCE_LABEL[e.kind] ?? "Evidence"}:</span>{" "}
                  <span className="font-mono text-[12px]">{e.text}</span>
                </li>
              ))}
            </ul>
          )}
          {task && (
            <p className="mt-1.5 text-[13px] text-slate-600">
              {ringLabel(task.ring)} · about {task.sizeEstimate} changed line{task.sizeEstimate === 1 ? "" : "s"}
              {task.acceptanceTestPaths.length > 0 && (
                <>
                  {" "}
                  · acceptance tests <span className="font-mono text-[12px]">{list(task.acceptanceTestPaths)}</span>
                </>
              )}
              {task.specAuthor.id && `, written by ${agentOf(task.specAuthor)}`}
            </p>
          )}
          {task?.status === "pending" && !attention && (
            <p className="mt-1 text-[13px] text-slate-600">
              The commons makes it a task within a minute. Next,{" "}
              {task.specAuthor.id ? agentOf(task.specAuthor) : "the spec author's agent"} writes the acceptance tests
              at those paths; then an agent can implement it.
            </p>
          )}
          {task?.status === "pending" && attention && (
            <p className="mt-1 text-[13px] text-amber-800">
              {problem ??
                "Still not a task after a few minutes: the commons may be refusing it. Its log on the server says why."}
              {session && " Decline it to take it back, then approve it again as it should be."}
            </p>
          )}
          {task?.status === "pending" && props.stuck && problem === undefined && (
            <Button size="sm" className="mt-2 mr-2" onClick={props.reload}>
              Check again
            </Button>
          )}
          {session && !task && !approving && (
            <Button size="sm" className="mt-2" onClick={() => setApproving(true)}>
              Approve as task
            </Button>
          )}
          {session && task?.status === "pending" && (
            <Button size="sm" variant="danger" className="mt-2" disabled={busy} onClick={decline}>
              {busy ? "Declining…" : "Decline"}
            </Button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-red-600">
              {error}
            </p>
          )}
          {session && !task && approving && (
            <ApproveForm
              proposal={p}
              cid={props.cid}
              session={session}
              owners={props.owners}
              youAreOwner={props.youAreOwner}
              rings={props.rings}
              onCancel={() => setApproving(false)}
              onApproved={(next) => {
                setApproving(false);
                props.onChange(next);
                const spec = next.task?.specAuthor;
                notify(
                  `Approved: the commons makes it a task within a minute. Next, ${spec?.id ? agentOf(spec) : "the spec author's agent"} writes the acceptance tests.`,
                );
              }}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function ApproveForm(props: {
  proposal: Proposal;
  cid: string;
  session: Session;
  owners: PersonRef[];
  youAreOwner: boolean;
  rings?: RingRule[];
  onCancel: () => void;
  onApproved: (p: Proposal) => void;
}) {
  const { session, rings } = props;
  const me = session.user.id;
  // the files the evidence points at, with their rings under the commons'
  // rules, lowest first: the task starts at the lowest
  const files = props.proposal.evidence.flatMap((e) => (typeof e.file === "string" && e.file !== "" ? [e.file] : []));
  const classified = rings ? ringsOf(files, rings) : [];
  const [ring, setRing] = useState<Ring | undefined>(classified[0]?.ring);
  const [ringError, setRingError] = useState("");
  // files the chosen ring is above: a change touching them fails the gate
  const below = ring === undefined ? [] : classified.filter((f) => f.ring < ring);
  const [size, setSize] = useState("");
  const [tests, setTests] = useState("");
  const [author, setAuthor] = useState(props.youAreOwner ? me : "");
  const [sizeError, setSizeError] = useState("");
  const [testsError, setTestsError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const authorId = `spec-author-${props.proposal.id}`;
  const ringName = `ring-${props.proposal.id}`;
  // you first, then the others
  const owners = [...props.owners].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));

  const submit = async () => {
    if (busy) return;
    setError("");
    const n = Number(size.trim());
    const sizeOk = /^\d+$/.test(size.trim()) && n <= MAX_SIZE;
    setSizeError(sizeOk ? "" : `How many lines it should change, a whole number up to ${MAX_SIZE}.`);
    const parsed = parseTestPaths(tests);
    setTestsError("error" in parsed ? parsed.error : "");
    setRingError(ring === undefined ? "Choose the ring of the files the change will touch." : "");
    if (!sizeOk || "error" in parsed || ring === undefined) return;
    if (!author) return setError("Choose whose agent writes the acceptance tests.");
    setBusy(true);
    try {
      const { proposal } = await approveProposal(session, props.cid, props.proposal.id, {
        ring,
        sizeEstimate: n,
        acceptanceTests: parsed.paths,
        ...(author === me ? {} : { specAuthor: author }),
      });
      props.onApproved(proposal);
    } catch (e) {
      setError(`Couldn't approve it: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <fieldset>
        <legend className="text-[13px] font-medium text-slate-700">Ring</legend>
        <p className="mt-0.5 text-[13px] text-slate-500">
          The lowest ring of any file the change will touch, as this repository's .commons/rules.json classifies it. A
          change that touches a lower ring than its task fails the rings gate, and a task's ring can't be changed later.
        </p>
        {classified.length > 0 && (
          <p className="mt-1 text-[13px] text-slate-600">
            The evidence points at{" "}
            {list(classified.map((f) => `${f.file} (ring ${f.ring})`))}.
          </p>
        )}
        {files.length > 0 && !rings && (
          <p className="mt-1 text-[13px] text-slate-600">
            The evidence points at {list(files)}; check the repository's rules for their ring.
          </p>
        )}
        <div className="mt-1.5 space-y-1.5">
          {RINGS.map((r) => (
            <label
              key={r.ring}
              className={cx(
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                "has-focus-visible:ring-2 has-focus-visible:ring-accent-200",
                ring === r.ring ? "border-accent-400 bg-accent-50" : "border-slate-200 bg-surface hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name={ringName}
                value={r.ring}
                checked={ring === r.ring}
                onChange={() => {
                  setRing(r.ring);
                  setRingError("");
                }}
                className="mt-0.5 accent-accent-solid"
              />
              <span>
                <span className="font-medium text-slate-800">{r.label}</span>
                <span className="block text-[13px] text-slate-500">
                  {r.explain}
                  {rings && ringGlobs(rings, r.ring)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {below.length > 0 && ring !== undefined && (
          <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {list(below.map((f) => f.file))} {below.length === 1 ? "is" : "are"} ring {below[0]!.ring} in this repository's
            rules. A task at ring {ring} fails the rings gate if its change touches {below.length === 1 ? "it" : "them"}.
          </p>
        )}
        {ringError && <p className="mt-1.5 text-[13px] text-red-600">{ringError}</p>}
      </fieldset>
      <Field
        label="Size estimate"
        value={size}
        onChange={(v) => {
          setSize(v);
          setSizeError("");
        }}
        placeholder="60"
        hint="About how many lines the change touches. It sets the stake an agent locks to claim it."
        error={sizeError}
        maxLength={6}
      />
      <Field
        label="Acceptance tests"
        value={tests}
        onChange={(v) => {
          setTests(v);
          setTestsError("");
        }}
        multiline
        placeholder="test/login.test.ts"
        hint="Paths the spec author's agent will write the tests at (new files, or the proposal's failing test), one per line, from the repository's root. They're the definition of done."
        error={testsError}
      />
      <div className="mt-3">
        <label htmlFor={authorId} className="mb-1 block text-[13px] font-medium text-slate-700">
          Spec author
        </label>
        {owners.length === 0 ? (
          <p className="text-[13px] text-slate-600">
            Nobody has an agent connected here yet, and the spec author, whose agent writes the acceptance tests, must be
            someone who has. Connect yours first.
          </p>
        ) : (
          <>
            <select
              id={authorId}
              value={author}
              onChange={(e) => {
                setAuthor(e.target.value);
                setError("");
              }}
              className={cx("h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-900", FIELD_FOCUS)}
            >
              {!author && <option value="">Choose…</option>}
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id === me ? `${o.name || "You"} (you)` : o.name || o.id}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[13px] text-slate-500">
              {props.youAreOwner
                ? "Whose agent writes the acceptance tests (the definition of done): yours, unless you pick someone else. The agent that implements the task may not change them."
                : "Whose agent writes the acceptance tests (the definition of done). It has to be someone with an agent connected here, and you have none yet. The agent that implements the task may not change them."}
            </p>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-red-600">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || owners.length === 0} onClick={submit}>
          {busy ? "Approving…" : "Approve as task"}
        </Button>
        <Button disabled={busy} onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// " The rules put src/cli.ts, src/gates/** and 3 more here." for a ring, or
// nothing when they name nothing in it.
function ringGlobs(rings: RingRule[], ring: Ring): string {
  const globs = rings.filter((r) => r.ring === ring && typeof r.glob === "string").map((r) => r.glob);
  if (globs.length === 0) return "";
  const shown = globs.slice(0, 4);
  const more = globs.length - shown.length;
  return ` The rules put ${more > 0 ? `${shown.join(", ")} and ${more} more` : list(shown)} here.`;
}
