// Talking to the Anthill backend: passkey accounts and sessions, communities,
// and inside each community its whole graph, tree actions and their dry runs,
// who someone can endorse, invites and polls. Profiles belong to the account.
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export const backendUrl: string =
  import.meta.env.VITE_BACKEND_URL || `http://${window.location.hostname}:5001/`;
export const wsUrl: string =
  import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:5001`;

export type Vote = { id: string; weight: string; dist: number; posInOther: number };

export type Person = {
  id: string;
  name: string;
  bio?: string;
  link?: string;
  // reputation and the voter's total vote weight, as 18-decimal strings
  currentRep: string;
  totalWeight: string;
  depth: number;
  sentTreeVote: string; // parent
  recTreeVotes: string[]; // children
  sentDagVotes: Vote[]; // endorsements given
  recDagVotes: Vote[]; // endorsements received
};

// The public community every server has, open to everyone.
export const DEFAULT_COMMUNITY = "commons";
// The original Anthill tree, kept to show how it works.
export const DEMO_COMMUNITY = "demo";

export type Visibility = "public" | "private";
export type JoinPolicy = "open" | "invite";

export type Community = {
  id: string;
  name: string;
  description: string;
  // private: only members can see it, and joining needs an invite
  visibility: Visibility;
  // open: anyone signed in can take a free spot; invite: invite links only
  joinPolicy: JoinPolicy;
  createdAt: string;
  founder: { id: string; name: string } | null;
  members: number;
  rootName: string;
  isFounder: boolean;
  // your standing, when you're a member
  you: { reputation: string; rank: number } | null;
};

export type CommunitySettings = Pick<Community, "name" | "description" | "visibility" | "joinPolicy">;

export type Graph = {
  version: number;
  rootId: string;
  maxRelRootDepth: number;
  community: Community;
  nodes: Record<string, Person>;
};

export type Session = { token: string; user: { id: string; name: string } };

// A failed request; status 404 means the community doesn't exist or is private.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(backendUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `${path} failed (${res.status})`, res.status);
  return data as T;
}

// A path inside a community.
const inside = (cid: string, path: string) => `c/${encodeURIComponent(cid)}/${path}`;

export const fetchGraph = (cid: string, session?: Session) =>
  request<Graph>(inside(cid, "graph"), undefined, session?.token);

export const fetchReach = (cid: string, id: string, session?: Session) =>
  request<{ canEndorse: string[] }>(inside(cid, `people/${id}/reach`), undefined, session?.token).then(
    (r) => r.canEndorse,
  );

//// history: the tree after every step, for the replay

export type HistoryNode = {
  id: string;
  name: string;
  currentRep: string;
  depth: number;
  sentTreeVote: string;
  recTreeVotes: string[];
  dagVotes: string[]; // who they endorse
};

export type HistoryStep = {
  index: number;
  eventName: string;
  voter: string;
  recipient: string;
  name: string;
  weight: string;
  nodes: HistoryNode[];
};

export const fetchHistory = (cid: string, session?: Session) =>
  request<{ steps: HistoryStep[] }>(inside(cid, "history"), undefined, session?.token).then((r) => r.steps);

//// communities

// Public communities and the private ones you belong to.
export const fetchCommunities = (session?: Session) =>
  request<{ communities: Community[] }>("communities", undefined, session?.token).then(
    (r) => r.communities,
  );

export const createCommunity = (session: Session, community: CommunitySettings & { id: string }) =>
  request<{ community: Community }>("communities", community, session.token).then(
    (r) => r.community,
  );

// Founder only.
export const saveCommunitySettings = (session: Session, cid: string, settings: CommunitySettings) =>
  request<{ community: Community }>(inside(cid, "settings"), settings, session.token).then(
    (r) => r.community,
  );

// A URL-friendly address from a name: "Book Club!" -> "book-club".
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
}

//// session (same storage key as the current app)

const SESSION_KEY = "anthill.session";

export function loadSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSession(session: Session | undefined) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

// Checks a stored session is still accepted (it isn't after expiry, or if the
// server's data was reset).
export const fetchMe = (token: string) =>
  request<{ user: Session["user"] }>("auth/me", undefined, token).then((r) => r.user);

export type Profile = { bio: string; link: string };

export const fetchProfile = (session: Session) =>
  request<{ profile: Profile }>("auth/me", undefined, session.token).then((r) => r.profile);

// A new account (or a recovered one) comes with a recovery code, shown once.
export type NewSession = Session & { recoveryCode: string };

export async function createAccount(name: string): Promise<NewSession> {
  const { flowId, options } = await request<{ flowId: string; options: any }>(
    "auth/register/options",
    { name },
  );
  const response = await startRegistration({ optionsJSON: options });
  return request<NewSession>("auth/register/verify", { flowId, response });
}

export async function recoverAccount(code: string): Promise<NewSession> {
  const { flowId, options } = await request<{ flowId: string; options: any }>(
    "auth/recover/options",
    { code },
  );
  const response = await startRegistration({ optionsJSON: options });
  return request<NewSession>("auth/recover/verify", { flowId, response });
}

// Another passkey (this device) for the signed-in account.
export async function addPasskey(session: Session): Promise<void> {
  const { flowId, options } = await request<{ flowId: string; options: any }>(
    "auth/passkeys/options",
    {},
    session.token,
  );
  const response = await startRegistration({ optionsJSON: options });
  await request("auth/passkeys/verify", { flowId, response }, session.token);
}

export async function newRecoveryCode(session: Session): Promise<string> {
  const { recoveryCode } = await request<{ recoveryCode: string }>(
    "auth/recovery-code",
    {},
    session.token,
  );
  return recoveryCode;
}

// Cancelling the browser's passkey sheet isn't an error worth showing.
export function isCancel(error: unknown): boolean {
  return (error as Error)?.name === "NotAllowedError";
}

// Renames the account and its node in every community it's in.
export const rename = (session: Session, name: string) =>
  request<{ user: Session["user"] }>("name", { name }, session.token).then((r) => r.user);

export async function signIn(): Promise<Session> {
  const { flowId, options } = await request<{ flowId: string; options: any }>(
    "auth/login/options",
    {},
  );
  const response = await startAuthentication({ optionsJSON: options });
  return request<Session>("auth/login/verify", { flowId, response });
}

//// actions

export type Action = { fn: string; args: Record<string, string> };
export type Check = { ok: true } | { ok: false; reason: string };

export function act(session: Session, cid: string, action: Action) {
  return request(inside(cid, "action"), action, session.token);
}

export async function check(session: Session, cid: string, actions: Action[]): Promise<Check[]> {
  const { results } = await request<{ results: Check[] }>(
    inside(cid, "check"),
    { actions },
    session.token,
  );
  return results;
}

//// invites

export function inviteLink(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}invite/${encodeURIComponent(code)}`;
}

export async function createInviteLink(session: Session, cid: string): Promise<string> {
  const { code } = await request<{ code: string }>(inside(cid, "invites"), {}, session.token);
  return inviteLink(code);
}

export const fetchInvite = (code: string, session?: Session) =>
  request<{ community: Community; inviter: { id: string; name: string }; expires: string }>(
    `invites/${encodeURIComponent(code)}`,
    undefined,
    session?.token,
  );

//// profiles

export const saveProfile = (session: Session, bio: string, link: string) =>
  request("profile", { bio, link }, session.token);

//// polls (each option's weight is its voters' total reputation)

export type Poll = {
  id: string;
  by: string;
  byName: string;
  question: string;
  options: string[];
  createdAt: string;
  closedAt?: string;
  tally: { weight: string; voters: number }[];
  myVote?: number;
};

export const fetchPolls = (cid: string, session?: Session) =>
  request<{ polls: Poll[] }>(inside(cid, "polls"), undefined, session?.token).then((r) => r.polls);

export const createPoll = (session: Session, cid: string, question: string, options: string[]) =>
  request(inside(cid, "polls"), { question, options }, session.token);

export const votePoll = (session: Session, cid: string, id: string, option: number) =>
  request(inside(cid, `polls/${id}/vote`), { option }, session.token);

export const closePoll = (session: Session, cid: string, id: string) =>
  request(inside(cid, `polls/${id}/close`), {}, session.token);
