// Talking to the Anthill backend: the whole graph, passkey accounts and
// sessions, tree actions and their dry runs, who someone can endorse, invites,
// profiles and polls.
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

export type Graph = {
  version: number;
  rootId: string;
  maxRelRootDepth: number;
  config?: { inviteOnly: boolean };
  nodes: Record<string, Person>;
};

export type Session = { token: string; user: { id: string; name: string } };

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
  if (!res.ok) throw new Error(data.error ?? `${path} failed (${res.status})`);
  return data as T;
}

export const fetchGraph = () => request<Graph>("graph");

export const fetchReach = (id: string) =>
  request<{ canEndorse: string[] }>(`people/${id}/reach`).then((r) => r.canEndorse);

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

export function act(session: Session, action: Action) {
  return request("action", action, session.token);
}

export async function check(session: Session, actions: Action[]): Promise<Check[]> {
  const { results } = await request<{ results: Check[] }>(
    "check",
    { actions },
    session.token,
  );
  return results;
}

//// invites

export function inviteLink(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}invite/${encodeURIComponent(code)}`;
}

export async function createInviteLink(session: Session): Promise<string> {
  const { code } = await request<{ code: string }>("invites", {}, session.token);
  return inviteLink(code);
}

export const fetchInvite = (code: string) =>
  request<{ inviter: { id: string; name: string }; expires: string }>(
    `invites/${encodeURIComponent(code)}`,
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

export const fetchPolls = (session?: Session) =>
  request<{ polls: Poll[] }>("polls", undefined, session?.token).then((r) => r.polls);

export const createPoll = (session: Session, question: string, options: string[]) =>
  request("polls", { question, options }, session.token);

export const votePoll = (session: Session, id: string, option: number) =>
  request(`polls/${id}/vote`, { option }, session.token);

export const closePoll = (session: Session, id: string) =>
  request(`polls/${id}/close`, {}, session.token);
