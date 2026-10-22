// Passkey sign-in against the backend (replaces the wallet). A passkey creates a
// user whose id is used in the tree exactly like an address was; the backend
// hands back a bearer token that authorises tree actions.
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export type SessionUser = { id: string; name: string };
export type Session = { token: string; user: SessionUser };

// What the action hooks need to talk to the backend as the signed-in user.
export type Api = { backendUrl: string; session: Session | undefined };

const STORAGE_KEY = "anthill.session";

export function loadSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSession(session: Session | undefined) {
  try {
    if (session === undefined) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable: the session just won't survive a reload.
  }
}

async function request<T>(
  backendUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(backendUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `${path} failed: ${response.status}`);
  }
  return data as T;
}

export async function createPasskey(
  backendUrl: string,
  name: string,
): Promise<Session> {
  const { flowId, options } = await request<{ flowId: string; options: any }>(
    backendUrl,
    "auth/register/options",
    { name },
  );
  const response = await startRegistration({ optionsJSON: options });
  return request<Session>(backendUrl, "auth/register/verify", {
    flowId,
    response,
  });
}

export async function signInWithPasskey(backendUrl: string): Promise<Session> {
  const { flowId, options } = await request<{ flowId: string; options: any }>(
    backendUrl,
    "auth/login/options",
    {},
  );
  const response = await startAuthentication({ optionsJSON: options });
  return request<Session>(backendUrl, "auth/login/verify", {
    flowId,
    response,
  });
}

// Checks a stored session is still accepted, and returns the current user.
export async function fetchMe(
  backendUrl: string,
  token: string,
): Promise<SessionUser> {
  const { user } = await request<{ user: SessionUser }>(
    backendUrl,
    "auth/me",
    undefined,
    token,
  );
  return user;
}

export async function sendAction(
  api: Api,
  fn: string,
  args: Record<string, string> = {},
): Promise<void> {
  if (api.session === undefined) {
    throw new Error("Sign in first");
  }
  await request(api.backendUrl, "action", { fn, args }, api.session.token);
}
