// Talking to the Anthill backend: the whole graph, the passkey session (shared
// with the current app through localStorage, same origin), tree actions and
// their dry runs, and who someone can endorse.
import { startAuthentication } from "@simplewebauthn/browser";

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

export async function createInviteLink(session: Session): Promise<string> {
  const { code } = await request<{ code: string }>("invites", {}, session.token);
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
}
