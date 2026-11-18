// The account page and Google's way back, against a fake server: the account
// page signed out, loading, failing (and failing to refresh after a change),
// for a passkey account and a Google-only one, saying why a button can't be
// used, ending a session, confirming it's you with Google (asked first) and
// deleting the account; the callback clears the address bar, keeps the
// session and goes back with what was asked for, or explains why not and tries
// again from where the person was; a page the browser brings back from Google
// is usable again.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browser } from "./api";
import { AccountPage } from "./pages/Account";
import { GoogleCallbackPage } from "./pages/GoogleCallback";
import { AppProvider, useApp } from "./state";

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: vi.fn(async () => ({})),
  startAuthentication: vi.fn(async () => ({})),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//// a fake server

type Reply = { status?: number; body: unknown };
let routes: Record<string, (init: RequestInit) => Reply | Promise<Reply>> = {};
const calls: { path: string; init: RequestInit }[] = [];
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\//, "");
  calls.push({ path, init });
  const route = routes[path];
  const reply = await (route ? route(init) : { status: 404, body: { error: "Not found" } });
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
});
const callsTo = (path: string) => calls.filter((c) => c.path === path);
const reauth = { status: 401, body: { error: "Please sign in again first, to confirm it's you.", code: "reauth" } };
const googleUrl = (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=${state}`;
const asked = vi.fn((_: string) => true);
const pending = () => new Promise<never>(() => {});

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  close() {}
}

const ada = { token: "tok-ada", user: { id: "0xada", name: "Ada" } };
const signedInAs = (s: typeof ada) => localStorage.setItem("anthill.session", JSON.stringify(s));

const account = (methods: object) => ({
  body: {
    user: ada.user,
    profile: { bio: "Counts things", link: "" },
    methods: { passkeys: 1, google: null, recoveryCode: true, ...methods },
  },
});
const passkeys = (n: number) => ({
  body: {
    passkeys: Array.from({ length: n }, (_, i) => ({
      id: `pk${i}`,
      createdAt: "2026-11-01T10:00:00Z",
      lastUsedAt: "2026-11-17T10:00:00Z",
      transports: ["internal"],
    })),
  },
});
const sessions = {
  body: {
    sessions: [
      { id: "s-here", method: "passkey", device: "Firefox on Linux", createdAt: "2026-11-18T09:00:00Z", current: true },
      { id: "s-phone", method: "google", device: "Safari on iOS", createdAt: "2026-11-10T09:00:00Z", current: false },
    ],
  },
};

//// rendering

let root: Root | undefined;
let app: ReturnType<typeof useApp>;
let where: { pathname: string; search: string };

function Probe() {
  app = useApp();
  const location = useLocation();
  where = { pathname: location.pathname, search: location.search };
  return null;
}

async function show(path: string) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <AppProvider>
          <Probe />
          <Routes>
            <Route path="/account" element={<AccountPage />} />
            <Route path="/auth/google" element={<GoogleCallbackPage />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    );
  });
}

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out; page says: ${text().slice(0, 300)}`);
    await tick();
  }
}
const text = () => document.body.textContent ?? "";
const buttons = (label: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label) as HTMLButtonElement[];
const button = (label: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button "${label}"`);
  return found as HTMLButtonElement;
};
const click = (b: HTMLElement) => act(async () => b.click());
// the toast, and whether it stays until closed
const toast = () => document.querySelector('[role="status"]');
const toastStays = () => toast()?.querySelector('button[aria-label="Close"]') != null;
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  routes = { "auth/me": () => account({}), communities: () => ({ body: { communities: [] } }) };
  calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("confirm", asked);
  asked.mockReset();
  asked.mockReturnValue(true);
  browser.leave = vi.fn();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("the account page", () => {
  it("asks you to sign in when you aren't", async () => {
    await show("/account");
    expect(text()).toContain("Sign in to see your account");
    await click(button("Sign in"));
    expect(text()).toContain("Sign in to Anthill");
  });

  it("shows placeholders while loading, and a way to try again when it fails", async () => {
    signedInAs(ada);
    let fail = true;
    routes["auth/passkeys"] = () => passkeys(1);
    routes["auth/sessions"] = () => (fail ? { status: 500, body: { error: "The server had a problem." } } : sessions);
    routes["auth/methods"] = pending;
    await show("/account");
    await until(() => text().includes("Couldn't load your account: The server had a problem."));
    fail = false;
    await click(button("Try again"));
    await until(() => text().includes("Firefox on Linux"));
  });

  it("lists a passkey account's ways in and sessions, and ends another session", async () => {
    signedInAs(ada);
    routes["auth/methods"] = () => ({ body: { passkey: true, google: true } });
    routes["auth/passkeys"] = () => passkeys(2);
    routes["auth/sessions"] = () => sessions;
    routes["auth/sessions/s-phone/end"] = () => ({ body: { ok: true } });
    await show("/account");
    await until(() => text().includes("Firefox on Linux"));

    expect(buttons("Remove")).toHaveLength(2);
    expect(buttons("Remove").every((b) => !b.disabled)).toBe(true);
    // Google is on: offered, not linked
    await until(() => text().includes("Not linked"));
    expect(buttons("Link")).toHaveLength(1);
    // this device is marked and can't be ended from the list
    expect(text()).toContain("This device");
    expect(buttons("End")).toHaveLength(1);

    const before = callsTo("auth/sessions").length;
    await click(buttons("End")[0]);
    await until(() => callsTo("auth/sessions/s-phone/end").length === 1);
    expect((callsTo("auth/sessions/s-phone/end")[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-ada",
    );
    // and shows what's true now
    await until(() => callsTo("auth/sessions").length > before);
  });

  it("keeps a Google-only account from removing its only way in", async () => {
    signedInAs(ada);
    routes["auth/me"] = () => account({ passkeys: 0, google: { email: "ada@example.com" }, recoveryCode: false });
    routes["auth/passkeys"] = () => passkeys(0);
    routes["auth/sessions"] = () => sessions;
    await show("/account");
    await until(() => text().includes("ada@example.com"));
    const unlink = button("Unlink");
    expect(unlink.disabled).toBe(true);
    // why, in words anyone sees, tied to the button
    expect(document.getElementById(unlink.getAttribute("aria-describedby")!)?.textContent).toMatch(
      /only way to sign in, so it can't be unlinked/,
    );
    expect(unlink.getAttribute("aria-label")).toBe("Unlink Google account ada@example.com");
    expect(text()).toContain("No passkeys yet");

    // its recovery code isn't about passkeys it doesn't have
    routes["auth/recovery-code"] = () => ({ body: { recoveryCode: "AAAA-BBBB" } });
    await click(button("Make a recovery code"));
    await until(() => text().includes("Save your recovery code"));
    expect(text()).not.toContain("all your passkeys");
    expect(text()).toContain("lose every way to sign in");
  });

  it("unlinks a Google account whose email the server doesn't have, saying what's erased", async () => {
    signedInAs(ada);
    routes["auth/methods"] = () => ({ body: { passkey: true, google: true } });
    routes["auth/me"] = () => account({ passkeys: 1, google: { email: null }, recoveryCode: true });
    routes["auth/passkeys"] = () => passkeys(1);
    routes["auth/sessions"] = () => sessions;
    routes["auth/google/unlink"] = () => {
      routes["auth/me"] = () => account({});
      return { body: { ok: true, endedSessions: 0 } };
    };
    await show("/account");
    await until(() => text().includes("A Google account"));
    expect(text()).not.toContain("null");
    const unlink = button("Unlink");
    expect(unlink.getAttribute("aria-label")).toBe("Unlink a Google account");
    await click(unlink);
    expect(asked.mock.calls[0][0]).toMatch(/^Unlink your Google account\?/);
    expect(asked.mock.calls[0][0]).toMatch(/email is erased from Anthill; Google's id for the account stays in Anthill's log/);
    await until(() => callsTo("auth/google/unlink").length === 1);
    await until(() => text().includes("Not linked"));
  });

  it("says why an only passkey can't be removed, and names what each button is for", async () => {
    signedInAs(ada);
    routes["auth/passkeys"] = () => passkeys(1);
    routes["auth/sessions"] = () => sessions;
    await show("/account");
    await until(() => text().includes("Firefox on Linux"));
    const remove = buttons("Remove")[0];
    expect(remove.disabled).toBe(true);
    expect(document.getElementById(remove.getAttribute("aria-describedby")!)?.textContent).toMatch(
      /only way to sign in, so it can't be removed/,
    );
    expect(remove.getAttribute("aria-label")).toMatch(/^Remove passkey on a device added /);
    expect(buttons("End")[0].getAttribute("aria-label")).toMatch(/^End the session on Safari on iOS, from /);
  });

  it("shows what a change did even when refreshing afterwards fails, and says so", async () => {
    signedInAs(ada);
    let sessionsFail = false;
    routes["auth/passkeys"] = () => passkeys(2);
    routes["auth/sessions"] = () => (sessionsFail ? { status: 503, body: { error: "The server is starting." } } : sessions);
    routes["auth/sessions/s-phone/end"] = () => {
      sessionsFail = true;
      return { body: { ok: true } };
    };
    await show("/account");
    await until(() => text().includes("Safari on iOS"));
    await click(buttons("End")[0]);
    await until(() => text().includes("Couldn't refresh your account"));
    expect(text()).not.toContain("Safari on iOS");
    expect(buttons("End")).toHaveLength(0);
    sessionsFail = false;
    await click(button("Try again"));
    await until(() => !text().includes("Couldn't refresh"));
  });

  it("asks before confirming it's you with Google, and isn't 'deleting' meanwhile", async () => {
    signedInAs(ada);
    routes["auth/me"] = () => account({ passkeys: 0, google: { email: "ada@example.com" }, recoveryCode: false });
    routes["auth/passkeys"] = () => passkeys(0);
    routes["auth/sessions"] = () => sessions;
    routes["auth/delete"] = () => reauth;
    routes["auth/google/start"] = () => ({ body: { url: googleUrl("st") } });
    let label = "";
    asked.mockImplementation(() => {
      label = button("Delete my account").textContent ?? "";
      return false;
    });
    await show("/account");
    await until(() => text().includes("Delete your account"));
    const field = [...document.querySelectorAll("input")].at(-1) as HTMLInputElement;
    await act(async () => typeInto(field, "Ada"));

    // declined: nothing happens, and nothing to say about it
    await click(button("Delete my account"));
    await until(() => asked.mock.calls.length === 1);
    await until(() => !button("Delete my account").disabled);
    expect(asked.mock.calls[0][0]).toMatch(/To delete your account, confirm it's you with Google/);
    expect(label).not.toContain("Deleting");
    expect(callsTo("auth/google/start")).toHaveLength(0);
    expect(toast()).toBeNull();

    // agreed: away to Google, to confirm it for this session
    asked.mockReturnValue(true);
    await click(button("Delete my account"));
    await until(() => vi.mocked(browser.leave).mock.calls.length === 1);
    expect(browser.leave).toHaveBeenCalledWith(googleUrl("st"));
    expect(JSON.parse(callsTo("auth/google/start")[0].init.body as string)).toMatchObject({ intent: "confirm" });
    expect(button("Delete my account").textContent).not.toContain("Deleting");
  });

  it("deletes the account only once its name is typed, then signs out", async () => {
    signedInAs(ada);
    routes["auth/passkeys"] = () => passkeys(1);
    routes["auth/sessions"] = () => sessions;
    routes["auth/delete"] = () => ({ body: { ok: true } });
    await show("/account");
    await until(() => text().includes("Delete your account"));
    const remove = button("Delete my account");
    expect(remove.disabled).toBe(true);
    const field = [...document.querySelectorAll("input")].at(-1) as HTMLInputElement;
    await act(async () => typeInto(field, "ada"));
    expect(remove.disabled).toBe(true);
    await act(async () => typeInto(field, "Ada"));
    expect(remove.disabled).toBe(false);
    await click(remove);
    await until(() => app.session === undefined);
    expect(JSON.parse(callsTo("auth/delete")[0].init.body as string)).toEqual({ confirm: "Ada" });
    expect(where.pathname).toBe("/");
    expect(localStorage.getItem("anthill.session")).toBeNull();
    // said where it lands, until closed
    expect(toast()?.textContent).toContain("Your account was deleted.");
    expect(toastStays()).toBe(true);
  });

  it("accepts the name as it shows when the stored one has double spaces or invisible characters", async () => {
    const una = { token: "tok-una", user: { id: "0xada", name: "Una  Ray​" } };
    signedInAs(una);
    routes["auth/me"] = () => ({ body: { ...account({}).body, user: una.user } });
    routes["auth/passkeys"] = () => passkeys(1);
    routes["auth/sessions"] = () => sessions;
    await show("/account");
    await until(() => text().includes("Delete your account"));
    const remove = button("Delete my account");
    const field = [...document.querySelectorAll("input")].at(-1) as HTMLInputElement;
    await act(async () => typeInto(field, "Una Ra"));
    expect(remove.disabled).toBe(true);
    await act(async () => typeInto(field, "Una Ray"));
    expect(remove.disabled).toBe(false);
  });
});

describe("coming back from Google", () => {
  const started = (flow: object) => sessionStorage.setItem("anthill.googleFlow", JSON.stringify(flow));

  it("clears the address bar at once, keeps the session and goes back", async () => {
    started({ state: "st", intent: "signin", returnTo: "/c/club/polls" });
    let answer!: (r: Reply) => void;
    routes["auth/google/finish"] = () => new Promise((r) => (answer = r));
    await show("/auth/google?code=secret-code&state=st");
    // before the server has answered
    expect(where).toEqual({ pathname: "/auth/google", search: "" });
    expect(text()).toContain("Signing you in with Google");
    await act(async () => answer({ body: { token: "tok-new", user: ada.user, created: true } }));
    await until(() => where.pathname === "/c/club/polls");
    expect(app.session?.token).toBe("tok-new");
    expect(JSON.parse(callsTo("auth/google/finish")[0].init.body as string)).toEqual({ state: "st", code: "secret-code" });
  });

  it("stops a sign-in this tab didn't start, with a way back", async () => {
    started({ state: "mine", intent: "signin", returnTo: "/c/club" });
    await show("/auth/google?code=c&state=someone-elses");
    await until(() => text().includes("Couldn't sign in with Google"));
    expect(text()).toContain("wasn't started from this tab");
    expect(callsTo("auth/google/finish")).toHaveLength(0);
    expect(app.session).toBeUndefined();
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/c/club");
  });

  it("says a failed link is about linking", async () => {
    signedInAs(ada);
    started({ state: "st", intent: "link", returnTo: "/account", userId: ada.user.id });
    routes["auth/google/finish"] = () => ({
      status: 400,
      body: { error: "That Google account is already linked to another Anthill account." },
    });
    await show("/auth/google?code=c&state=st");
    await until(() => text().includes("Couldn't link Google"));
    expect(text()).toContain("already linked to another");
    expect(text()).not.toContain("Couldn't sign in");
  });

  it("tries again from where the person was", async () => {
    started({ state: "st", intent: "signin", returnTo: "/invite/abc" });
    routes["auth/methods"] = () => ({ body: { passkey: true, google: true } });
    routes["auth/google/start"] = () => ({ body: { url: googleUrl("again") } });
    await show("/auth/google?error=access_denied&state=st");
    await until(() => text().includes("Google sign-in was cancelled."));
    await click(button("Try again"));
    expect(where.pathname).toBe("/invite/abc");
    expect(text()).toContain("Sign in to Anthill");
    await until(() => text().includes("Continue with Google"));
    await click(button("Continue with Google"));
    await until(() => vi.mocked(browser.leave).mock.calls.length === 1);
    expect(JSON.parse(sessionStorage.getItem("anthill.googleFlow")!)).toMatchObject({ returnTo: "/invite/abc" });
  });

  it("after confirming it's you, says which change to make again, until closed", async () => {
    signedInAs(ada);
    started({ state: "st", intent: "confirm", returnTo: "/account", userId: ada.user.id, action: "delete your account" });
    routes["auth/google/finish"] = () => ({ body: { token: "tok-fresh", user: ada.user } });
    routes["auth/sign-out"] = () => ({ body: { ok: true } });
    routes["auth/passkeys"] = () => passkeys(0);
    routes["auth/sessions"] = () => sessions;
    await show("/auth/google?code=c&state=st");
    await until(() => where.pathname === "/account");
    expect(app.session?.token).toBe("tok-fresh");
    expect((callsTo("auth/google/finish")[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-ada");
    expect(toast()?.textContent).toContain("Now delete your account again");
    expect(toastStays()).toBe(true);
  });

  it("tells someone who meant to sign in that Google made a new account", async () => {
    started({ state: "st", intent: "signin", returnTo: "/", fromSignIn: true });
    routes["auth/google/finish"] = () => ({ body: { token: "tok-new", user: ada.user, created: true } });
    await show("/auth/google?code=c&state=st");
    await until(() => where.pathname === "/");
    expect(toast()?.textContent).toMatch(/No Anthill account used that Google account/);
    expect(toastStays()).toBe(true);
  });

  it("opens Start a community once back, when that's what signing in was for", async () => {
    started({ state: "st", intent: "signin", returnTo: "/", then: "create" });
    routes["auth/google/finish"] = () => ({ body: { token: "tok-new", user: ada.user, created: true } });
    await show("/auth/google?code=c&state=st");
    await until(() => where.pathname === "/");
    await until(() => text().includes("Start a community"));
    expect(text()).toContain("Welcome to Anthill");
  });

  it("frees the sign-in dialog when the browser brings the page back from Google", async () => {
    routes["auth/methods"] = () => ({ body: { passkey: true, google: true } });
    routes["auth/google/start"] = () => ({ body: { url: googleUrl("st") } });
    await show("/c/club");
    await act(async () => app.openAuth("signin"));
    await until(() => text().includes("Continue with Google"));
    await click(button("Continue with Google"));
    await until(() => vi.mocked(browser.leave).mock.calls.length === 1);
    expect(button("Continue with passkey").disabled).toBe(true);
    await act(async () => void window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    await until(() => !button("Continue with passkey").disabled);
    expect(button("Continue with Google").disabled).toBe(false);
    expect(text()).not.toContain("Back from Google");
  });
});
