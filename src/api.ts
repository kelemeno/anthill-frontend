// Talking to the Anthill backend: accounts (passkeys, Google through the
// backend, sessions, export and deletion), communities, and inside each
// community its whole graph, tree actions and their dry runs, who someone can
// endorse, invites and polls, and for a community with an agent commons,
// pairing agents with it. Profiles belong to the account.
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
export type JoinPolicy = "open" | "invite" | "closed";

export type Community = {
  id: string;
  name: string;
  description: string;
  // private: only members can see it, and joining needs an invite
  visibility: Visibility;
  // open: anyone signed in can take a free spot; invite: invite links only;
  // closed: nobody new (like the demo)
  joinPolicy: JoinPolicy;
  createdAt: string;
  founder: { id: string; name: string } | null;
  members: number;
  rootName: string;
  isFounder: boolean;
  // whether you may change its settings: the founder, or the tree's root when
  // it has none (its founder deleted their account). Missing from older
  // servers, where it's the founder only.
  canChangeSettings?: boolean;
  // your standing, when you're a member
  you: { reputation: string; rank: number } | null;
  // its agent commons, for a community that has one (operator config, never
  // a founder's): the coordinator agents work through, and the commons' public
  // site. Missing from older servers, like null.
  commons?: Commons | null;
};

export type CommunitySettings = Pick<Community, "name" | "description" | "visibility" | "joinPolicy">;

export type Graph = {
  version: number;
  // the websocket says "update:<updateKey>" after changes here (private
  // communities get a key that isn't their id)
  updateKey?: string;
  rootId: string;
  maxRelRootDepth: number;
  community: Community;
  nodes: Record<string, Person>;
};

export type Session = { token: string; user: { id: string; name: string } };

// A failed request; status 404 means the community doesn't exist or is private.
// `code` is the server's, when it gives one ("reauth": see withFreshSignIn).
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

// The server is still starting (it answers 503 until its data is loaded):
// worth asking again shortly, and no sign that anything is gone.
export const isStarting = (e: unknown) => e instanceof ApiError && e.status === 503;

// asking a starting server again: 1 s, 2 s, 4 s, ... up to 15 s
export const retryDelay = (attempt: number) => Math.min(15_000, 1000 * 2 ** attempt);

// What the server says when it no longer accepts a session token.
const SESSION_REJECTED = /^(session expired|bad session token|unknown user|not signed in)$/i;
let onSessionRejected: ((token: string) => void) | undefined;

// Called with the token whenever the server rejects it, from any request.
export function whenSessionRejected(handler: ((token: string) => void) | undefined) {
  onSessionRejected = handler;
}

async function request<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(backendUrl + path, {
    method: body === undefined ? "GET" : "POST",
    // a GET without a body or a token is a simple request: no CORS preflight
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error ?? `${path} failed (${res.status})`;
    if (res.status === 401 && token && SESSION_REJECTED.test(message)) onSessionRejected?.(token);
    throw new ApiError(message, res.status, typeof data.code === "string" ? data.code : undefined);
  }
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

// The founder only, or the root of a community without one.
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

// Just the token and the user: a new account's recovery code (NewSession) is
// shown once and never kept.
export const sessionOf = (s: Session): Session => ({ token: s.token, user: { id: s.user.id, name: s.user.name } });

export function loadSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Session;
    const session = sessionOf(stored);
    // older versions kept the recovery code too
    if ("recoveryCode" in stored) saveSession(session);
    return session;
  } catch {
    return undefined;
  }
}

export function saveSession(session: Session | undefined) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(sessionOf(session)));
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

// How the account signs in. The Google email is shown only to the account
// holder. It's kept outside the server's log, so it can be erased: null when
// the server doesn't have it (shown as "a Google account").
export type SignInMethods = {
  passkeys: number;
  google: { email: string | null } | null;
  recoveryCode: boolean;
};

export type Account = { user: Session["user"]; profile: Profile; methods: SignInMethods };

export const fetchAccount = (session: Session) => request<Account>("auth/me", undefined, session.token);

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

// Account changes need a recent sign-in. When the server asks for one
// ("reauth"), sign in again with a passkey and retry once with that session,
// which `onSession` gets to keep. Google confirms it's you instead for an
// account without passkeys, or when the passkey sheet is closed (no passkey at
// hand) and Google is linked: asked first, then away to Google and back to the
// account page, where the person does `action` again (it isn't retried by
// itself: the page is gone).
async function withFreshSignIn<T>(
  session: Session,
  onSession: (s: Session) => void,
  // what the change is, for the questions asked ("delete your account")
  action: string,
  run: (s: Session) => Promise<T>,
): Promise<T> {
  try {
    return await run(session);
  } catch (e) {
    if (!(e instanceof ApiError && e.code === "reauth")) throw e;
    const methods = await signInMethods(session);
    if (methods?.passkeys === 0 && methods.google) return confirmWithGoogle(session, action);
    let fresh: Session;
    try {
      fresh = await signIn();
    } catch (e) {
      if (isCancel(e) && methods?.google) {
        return confirmWithGoogle(session, action, "No passkey confirmed it's you. ");
      }
      throw e;
    }
    if (fresh.user.id !== session.user.id) {
      retire(fresh);
      throw new ApiError("That passkey is for another account: sign in with one of this account's.", 401);
    }
    onSession(fresh);
    retire(session);
    return run(fresh);
  }
}

// A session token nothing keeps any more (replaced by a fresh one) is ended on
// the server rather than left in the sessions list. Best effort: it expires
// anyway.
function retire(session: Session) {
  signOut(session).catch(() => {});
}

// How the account signs in, or nothing from an older server without
// `methods` (passkeys, as before).
const signInMethods = (session: Session) =>
  fetchAccount(session).then(
    (a) => a.methods as SignInMethods | undefined,
    () => undefined,
  );

// What a person who said no (or closed a sheet) gets: nothing to show.
const cancelled = (message: string) => Object.assign(new Error(message), { name: "NotAllowedError" });

// Another passkey (this device) for the signed-in account.
export async function addPasskey(session: Session, onSession: (s: Session) => void): Promise<void> {
  const { flowId, options, token } = await withFreshSignIn(session, onSession, "add a passkey", async (s) => ({
    ...(await request<{ flowId: string; options: any }>("auth/passkeys/options", {}, s.token)),
    token: s.token,
  }));
  const response = await startRegistration({ optionsJSON: options });
  await request("auth/passkeys/verify", { flowId, response }, token);
}

export async function newRecoveryCode(session: Session, onSession: (s: Session) => void): Promise<string> {
  const { recoveryCode } = await withFreshSignIn(session, onSession, "make a recovery code", (s) =>
    request<{ recoveryCode: string }>("auth/recovery-code", {}, s.token),
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

// Ends this session on the server. Whatever the answer, the caller forgets the
// token: signing out never waits on, or fails because of, the server.
export const signOut = (session: Session) => request("auth/sign-out", {}, session.token);

// Ends every session of the account, this one too.
export const signOutEverywhere = (session: Session) => request("auth/sign-out-everywhere", {}, session.token);

// Which ways to sign in this server offers (Google only when it's set up).
export type AuthMethods = { passkey: boolean; google: boolean };

export const fetchAuthMethods = () => request<AuthMethods>("auth/methods");

//// Google sign-in. The backend talks to Google (authorization code with
//// PKCE); no Google script runs on our pages. This tab goes to Google and
//// comes back to /auth/google, which finishes the flow.

const GOOGLE_ORIGIN = "https://accounts.google.com";
const GOOGLE_FLOW = "anthill.googleFlow";
const CALLBACK_PATH = "/auth/google";

// signin: sign in, or make an account for a Google account no account uses
// yet; link: add Google to the signed-in account; confirm: the fresh sign-in
// an account change needs, which the server gives only for the Google account
// already linked to the signed-in one (it never makes an account for it).
export type GoogleIntent = "signin" | "link" | "confirm";

// What this tab started, kept in sessionStorage while it's away at Google. The
// callback finishes a flow only when Google sends back the same state, so
// nobody can sign you into their account with a link they made. `userId` is
// the account it's for (linking or confirming): the one that must still be
// signed in when it comes back.
export type GoogleFlow = {
  state: string;
  intent: GoogleIntent;
  returnTo: string;
  userId?: string;
  // started from the sign-in dialog: a new account is then a surprise, said so
  fromSignIn?: boolean;
  // what to open once back: Start a community, asked for while signed out
  then?: "create";
  // when confirming: the change it's for, to say what to do again
  action?: string;
};

// Leaving the page for Google's. In one place so tests can stand in for the
// browser.
export const browser = { leave: (url: string) => window.location.assign(url) };

// A path on this site, for going back after signing in: anything else
// ("//elsewhere.example", "https://…", "javascript:…") goes home instead.
export function sameSitePath(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/";
  }
  try {
    const url = new URL(path, window.location.origin);
    // (the parser drops tabs and newlines, which can turn "/\t/x" into "//x")
    if (url.origin !== window.location.origin || url.pathname === CALLBACK_PATH) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

// Remembers the flow and goes to Google's page. It doesn't resolve: the page
// is going away. If the person comes Back from Google and the browser
// restores this page as it was (its back-forward cache), it settles as a
// cancel, so what waited on it (a busy button) is usable again. The flow stays
// remembered: going Forward to Google can still finish it.
function toGoogle(url: string, flow: Omit<GoogleFlow, "state">): Promise<never> {
  let state: string | null = null;
  try {
    const parsed = new URL(url);
    if (parsed.origin === GOOGLE_ORIGIN) state = parsed.searchParams.get("state");
  } catch {}
  if (!state) throw new ApiError("Couldn't start signing in with Google. Try again in a moment.", 502);
  try {
    sessionStorage.setItem(GOOGLE_FLOW, JSON.stringify({ ...flow, state, returnTo: sameSitePath(flow.returnTo) }));
  } catch {
    throw new ApiError("This browser won't let Anthill remember the sign-in while you're at Google. Use a passkey instead.", 0);
  }
  return new Promise<never>((_, reject) => {
    const back = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      window.removeEventListener("pageshow", back);
      reject(cancelled("Back from Google"));
    };
    window.addEventListener("pageshow", back);
    browser.leave(url);
  });
}

const startGoogle = (intent: GoogleIntent, token?: string) =>
  request<{ url: string }>("auth/google/start", { intent, origin: window.location.origin }, token);

// Signs in (or makes an account) with Google, then comes back to `returnTo`.
export async function signInWithGoogle(
  returnTo: string,
  options: Pick<GoogleFlow, "fromSignIn" | "then"> = {},
): Promise<never> {
  const { url } = await startGoogle("signin");
  return toGoogle(url, { intent: "signin", returnTo, ...options });
}

// Told when an account change is about to confirm it's you with Google (the
// question, then away to Google), so the page can stop saying it's doing the
// change. One listener: the account page's.
let confirmingWithGoogle: (() => void) | undefined;
export function whenConfirmingWithGoogle(callback: (() => void) | undefined) {
  confirmingWithGoogle = callback;
}

// The fresh sign-in an account change needs, through the Google account linked
// to this one. Asked first: the page goes away, and the change has to be made
// again once back. `why` comes before the question.
async function confirmWithGoogle(session: Session, action: string, why = ""): Promise<never> {
  confirmingWithGoogle?.();
  const question = `${why}To ${action}, confirm it's you with Google: you'll go to Google and come back to this page, then ${action} again.`;
  if (!window.confirm(question)) throw cancelled("Not confirmed with Google");
  const { url } = await startGoogle("confirm", session.token);
  return toGoogle(url, { intent: "confirm", returnTo: "/account", userId: session.user.id, action });
}

// Links a Google account to the signed-in account, as another way in.
export async function linkGoogle(session: Session, onSession: (s: Session) => void): Promise<never> {
  const { url } = await withFreshSignIn(session, onSession, "link Google", (s) => startGoogle("link", s.token));
  return toGoogle(url, { intent: "link", returnTo: "/account", userId: session.user.id });
}

export async function unlinkGoogle(session: Session, onSession: (s: Session) => void): Promise<void> {
  await withFreshSignIn(session, onSession, "unlink Google", (s) => request("auth/google/unlink", {}, s.token));
}

const INTENTS: readonly string[] = ["signin", "link", "confirm"] satisfies GoogleIntent[];

// The flow this tab started, once: reading it forgets it, so a callback URL
// opened again (or in another tab) finishes nothing.
export function takeGoogleFlow(): GoogleFlow | undefined {
  try {
    const raw = sessionStorage.getItem(GOOGLE_FLOW);
    sessionStorage.removeItem(GOOGLE_FLOW);
    if (!raw) return undefined;
    const flow = JSON.parse(raw);
    if (typeof flow?.state !== "string" || !INTENTS.includes(flow.intent)) return undefined;
    return {
      state: flow.state,
      intent: flow.intent,
      returnTo: sameSitePath(flow.returnTo),
      userId: typeof flow.userId === "string" ? flow.userId : undefined,
      ...(flow.fromSignIn === true && { fromSignIn: true }),
      ...(flow.then === "create" && { then: "create" as const }),
      ...(typeof flow.action === "string" && { action: flow.action }),
    };
  } catch {
    return undefined;
  }
}

// What /auth/google comes to: a session to keep and where to go (and what to
// say or open there), or why not (with where to go back to, and what the flow
// was for, when one was started here).
export type GoogleOutcome =
  | ({ ok: true; session: Session; returnTo: string; done: "signedIn" | "created" | "confirmed" | "linked" } & Pick<
      GoogleFlow,
      "fromSignIn" | "then" | "action"
    >)
  | { ok: false; message: string; returnTo: string; intent?: GoogleIntent };

// Finishes the flow Google sent this tab back with (`query` is the callback's
// query string), as `current`, the session held now, if any.
export async function finishGoogle(query: URLSearchParams, current: Session | undefined): Promise<GoogleOutcome> {
  const flow = takeGoogleFlow();
  const returnTo = flow?.returnTo ?? "/";
  const fail = (message: string): GoogleOutcome => ({ ok: false, message, returnTo, intent: flow?.intent });
  const state = query.get("state");
  const code = query.get("code");
  const error = query.get("error");
  if (!flow || !state || state !== flow.state) {
    return fail("This sign-in wasn't started from this tab, so it was stopped. Start again from Anthill.");
  }
  if (error) {
    return fail(error === "access_denied" ? "Google sign-in was cancelled." : `Google couldn't sign you in (${error}).`);
  }
  if (!code) return fail("Google didn't send a sign-in code back. Try again.");
  try {
    if (flow.intent === "link" || flow.intent === "confirm") {
      // both are for the signed-in account, and finish with its session
      if (!current || current.user.id !== flow.userId) {
        return fail(
          flow.intent === "link"
            ? "Sign in to the account you were linking Google to, then try again."
            : "Sign in to the account you were confirming, then try again.",
        );
      }
      const answer = await request<Partial<Session>>("auth/google/finish", { state, code }, current.token);
      // a new session if the server sends one for this account
      const fresh = answer.token && answer.user?.id === current.user.id ? sessionOf(answer as Session) : undefined;
      if (flow.intent === "confirm") {
        if (!fresh) return fail("Google didn't confirm it's you. Try again.");
        retire(current);
        return { ok: true, session: fresh, returnTo, done: "confirmed", action: flow.action };
      }
      if (fresh) retire(current);
      return { ok: true, session: fresh ?? current, returnTo, done: "linked" };
    }
    const answer = await request<Session & { created?: boolean }>("auth/google/finish", { state, code });
    const session = sessionOf(answer);
    if (current && current.token !== session.token) retire(current);
    return {
      ok: true,
      session,
      returnTo,
      done: answer.created ? "created" : "signedIn",
      ...(flow.fromSignIn && { fromSignIn: true }),
      ...(flow.then && { then: flow.then }),
    };
  } catch (e) {
    return fail((e as Error).message);
  }
}

//// the account page: passkeys, sessions, export and deletion

export type Passkey = { id: string; createdAt: string; lastUsedAt?: string; transports: string[] };

export const fetchPasskeys = (session: Session) =>
  request<{ passkeys: Passkey[] }>("auth/passkeys", undefined, session.token).then((r) => r.passkeys);

// Refused by the server when it would leave the account no way to sign in.
export async function removePasskey(session: Session, onSession: (s: Session) => void, id: string): Promise<void> {
  await withFreshSignIn(session, onSession, "remove that passkey", (s) =>
    request(`auth/passkeys/${encodeURIComponent(id)}/remove`, {}, s.token),
  );
}

// How a session was made: signing in with a passkey or Google, creating the
// account, or recovering it.
export type SignInMethod = "passkey" | "google" | "register" | "recovery";

// A signed-in session of the account (`current` is this one), unexpired.
export type ActiveSession = { id: string; method: SignInMethod; device: string; createdAt: string; current: boolean };

export const fetchSessions = (session: Session) =>
  request<{ sessions: ActiveSession[] }>("auth/sessions", undefined, session.token).then((r) => r.sessions);

// Ending a session is defensive, so it needs no fresh sign-in.
export const endSession = (session: Session, id: string) =>
  request(`auth/sessions/${encodeURIComponent(id)}/end`, {}, session.token);

// Everything Anthill holds about the account, saved as a JSON file.
export async function downloadMyData(session: Session): Promise<void> {
  const data = await request<unknown>("auth/export", undefined, session.token);
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = `anthill-account-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  // (revoked later: some browsers start the download after click() returns)
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Deletes the account for good; `confirm` is its name, typed out. Every
// session ends with it.
export async function deleteAccount(
  session: Session,
  onSession: (s: Session) => void,
  confirm: string,
): Promise<void> {
  await withFreshSignIn(session, onSession, "delete your account", (s) => request("auth/delete", { confirm }, s.token));
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
  // whether the viewer may close it (its creator, or once they've left the
  // founder); missing from older backends
  canClose?: boolean;
};

export const fetchPolls = (cid: string, session?: Session) =>
  request<{ polls: Poll[] }>(inside(cid, "polls"), undefined, session?.token).then((r) => r.polls);

export const createPoll = (session: Session, cid: string, question: string, options: string[]) =>
  request(inside(cid, "polls"), { question, options }, session.token);

export const votePoll = (session: Session, cid: string, id: string, option: number) =>
  request(inside(cid, `polls/${id}/vote`), { option }, session.token);

export const closePoll = (session: Session, cid: string, id: string) =>
  request(inside(cid, `polls/${id}/close`), {}, session.token);

//// agents: a community's agent commons. A member pairs their own agent (run
//// in their own sandbox and account) with a one-time code from a prompt;
//// Anthill vouches for the agent once the member approves it here.

// repo: the target repository agents clone, when the operator named it.
// modelFamilies: the model families the commons takes (its rules), when the
// server says; an agent declaring another one is refused when it's approved.
export type Commons = { coordinator: string; site: string; repo?: string; modelFamilies?: string[] };

// What the agent says it is. harness: "claude-code", "codex", or the person's
// words; modelFamily: a lowercase word ("claude", "gpt", ...), self-declared.
export type AgentKind = { harness: string; modelFamily: string };

// A new pairing: the prompt to give the agent (the server writes it, with the
// right addresses and the code in it), and the one to run it on a loop with.
export type Pairing = { id: string; code: string; expiresAt: string; prompt: string; loopPrompt: string };

export type PairingStatus = "open" | "claimed" | "approved" | "rejected" | "expired";

// Where a pairing is: claimed once an agent has used the code, and then what it
// declared and its key's fingerprint, for the person to compare with what
// their agent printed.
export type PairingState = {
  id: string;
  status: PairingStatus;
  expiresAt: string;
  claim?: AgentKind & { fingerprint: string };
};

export type Agent = AgentKind & {
  keyId: string;
  active: boolean;
  revokedReason?: string;
  registeredAt: string;
};

// The instructions every agent of the commons reads (public).
export const agentInstructionsUrl = (cid: string) => backendUrl + inside(cid, "commons/agent.md");

// What an agent on a loop is told each time, when the server doesn't say.
// (the server's own words: the agent reads the page verbatim with curl, not
// through a web-fetch tool that summarizes it)
export const loopPromptFor = (cid: string) =>
  `Read your instructions verbatim: run \`curl -fsSL ${agentInstructionsUrl(cid)}\` in your shell and follow the page exactly as printed (not through a web-fetch or summarizing tool, which would reword its commands and rules), and do one iteration as it says.`;

export const createPairing = (session: Session, cid: string, kind: AgentKind) =>
  request<Omit<Pairing, "loopPrompt"> & { loopPrompt?: string }>(inside(cid, "commons/pairings"), kind, session.token).then(
    (p): Pairing => ({ ...p, loopPrompt: p.loopPrompt || loopPromptFor(cid) }),
  );

const pairingPath = (cid: string, id: string, then = "") =>
  inside(cid, `commons/pairings/${encodeURIComponent(id)}${then}`);

export const fetchPairing = (session: Session, cid: string, id: string) =>
  request<PairingState>(pairingPath(cid, id), undefined, session.token);

// Anthill signs for the agent and tells the commons' coordinator. A failure to
// reach it leaves the pairing approvable.
export const approvePairing = (session: Session, cid: string, id: string) =>
  request<{ agent: Pick<Agent, "keyId" | "modelFamily" | "harness"> }>(pairingPath(cid, id, "/approve"), {}, session.token).then(
    (r) => r.agent,
  );

export const rejectPairing = (session: Session, cid: string, id: string) =>
  request(pairingPath(cid, id, "/reject"), {}, session.token);

// Your agents in this community's commons, revoked ones too.
export const fetchAgents = (session: Session, cid: string) =>
  request<{ agents: Agent[] }>(inside(cid, "commons/agents"), undefined, session.token).then((r) => r.agents);

// Revoking is defensive (a leaked key, an agent gone wrong), so it needs no
// fresh sign-in. The reason goes into the commons' public ledger.
export const revokeAgent = (session: Session, cid: string, keyId: string, reason?: string) =>
  request(
    inside(cid, `commons/agents/${encodeURIComponent(keyId)}/revoke`),
    reason ? { reason } : {},
    session.token,
  );
