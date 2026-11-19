// The account page (/account): the same in every community. Name and profile,
// the ways to sign in (passkeys, Google) and the recovery code, the sessions
// signed in now, downloading everything Anthill holds about you, and deleting
// the account. Changes that need a recent sign-in ask for one (a passkey, or
// Google for an account without passkeys or without one at hand) and say so.
// A button that can't be used says why, in words, next to it.
import { Download, KeyRound, LogOut, Monitor, RefreshCw, Trash2, UserPen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type Account,
  type ActiveSession,
  addPasskey,
  deleteAccount,
  downloadMyData,
  endSession,
  fetchAccount,
  fetchPasskeys,
  fetchSessions,
  isCancel,
  linkGoogle,
  newRecoveryCode,
  type Passkey,
  removePasskey,
  type Session,
  type SignInMethod,
  signOutEverywhere,
  unlinkGoogle,
  whenConfirmingWithGoogle,
} from "../api";
import { ProfileModal } from "../components/AccountMenu";
import { GoogleMark, useGoogleSignIn } from "../components/GoogleButton";
import { Skeleton } from "../components/Skeletons";
import { useApp } from "../state";
import { Avatar, Badge, Button, Card, CardTitle, Field, SiteFooter, useAppNavigate } from "../ui";

export function AccountPage() {
  const { session, openAuth } = useApp();
  if (!session) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold">Your account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to see your account: how you sign in, where you're signed in, your data.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => openAuth("signin")}>
          Sign in
        </Button>
      </Card>
    );
  }
  return <AccountSettings key={session.user.id} session={session} />;
}

type Loaded = { account: Account; passkeys: Passkey[]; sessions: ActiveSession[] };

// A name as it shows, to compare the one typed to confirm deletion: names from
// before the server cleaned them may hold double spaces or invisible
// characters, which nobody can type. (Looser than the server's cleanName,
// which keeps joiners inside emoji and some scripts; it checks again.)
const asShown = (name: string) =>
  name
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}ᅟᅠ⠀ㅤﾠ]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const MADE_BY: Record<SignInMethod, string> = {
  passkey: "Signed in with a passkey",
  google: "Signed in with Google",
  register: "Signed in when the account was made",
  recovery: "Signed in with the recovery code",
};

// What kind of passkey, from how the browser said it can be reached.
function passkeyKind(transports: string[]): string {
  if (transports.includes("internal")) return "Passkey on a device";
  if (transports.includes("hybrid")) return "Passkey on a phone";
  if (transports.some((t) => t === "usb" || t === "nfc" || t === "ble")) return "Security key";
  return "Passkey";
}

function AccountSettings(props: { session: Session }) {
  const { session } = props;
  const { setSession, notify, showRecoveryCode, communities } = useApp();
  const navigate = useAppNavigate();
  const googleOffered = useGoogleSignIn();
  const [loaded, setLoaded] = useState<Loaded>();
  const [loadError, setLoadError] = useState("");
  // which change is running (one at a time)
  const [busy, setBusy] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // a fresh sign-in replaces the token: everything is asked again with it,
  // and an answer for the old one is dropped
  const token = session.token;
  const latest = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: token stands for the session
  const load = useCallback(() => {
    const seq = ++latest.current;
    setLoadError("");
    Promise.all([fetchAccount(session), fetchPasskeys(session), fetchSessions(session)]).then(
      ([account, passkeys, sessions]) => seq === latest.current && setLoaded({ account, passkeys, sessions }),
      (e: Error) => seq === latest.current && setLoadError(e.message),
    );
  }, [token]);
  useEffect(load, [load]);
  // what a change reloads with: the session after it (it may have signed in again)
  const reload = useRef(load);
  reload.current = load;

  // confirming it's you with Google asks, then leaves the page: the change
  // isn't running any more ("Deleting…" would be wrong), but nothing else
  // should start either
  useEffect(() => {
    whenConfirmingWithGoogle(() => setBusy("google"));
    return () => whenConfirmingWithGoogle(undefined);
  }, []);

  // what a change did, shown at once: right even if reloading then fails
  const patch = (update: (l: Loaded) => Loaded) => setLoaded((l) => l && update(l));

  // Runs one change, then shows what's true now. Errors go to a toast, as
  // elsewhere in the app; cancelling the passkey sheet isn't one.
  const change = (key: string, work: () => Promise<string | void>) => async () => {
    if (busy) return;
    setBusy(key);
    try {
      const done = await work();
      if (done) notify(done);
      reload.current();
    } catch (e) {
      if (!isCancel(e)) notify((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  // The same, for a change that ends this session (signing out everywhere,
  // deleting the account): then it's forgotten here, and the page is left.
  const leave = async (
    key: string,
    question: string | undefined,
    work: () => Promise<string>,
    // where its error shows (a toast, unless given)
    onError?: (message: string) => void,
  ) => {
    if (busy || (question && !confirm(question))) return;
    setBusy(key);
    onError?.("");
    try {
      const done = await work();
      setSession(undefined);
      navigate("/", { global: true });
      // the page it was done on is gone: it stays until closed
      notify(done, { stay: true });
    } catch (e) {
      if (!isCancel(e)) (onError ?? notify)((e as Error).message);
      setBusy(undefined);
    }
  };

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
        {loadError ? (
          <Card>
            <p className="text-sm text-slate-600">Couldn't load your account: {loadError}</p>
            <Button size="sm" className="mt-3" onClick={load}>
              Try again
            </Button>
          </Card>
        ) : (
          [0, 1, 2].map((i) => (
            <Card key={i} aria-hidden>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-3/5" />
            </Card>
          ))
        )}
      </div>
    );
  }

  const { account, passkeys, sessions } = loaded;
  const google = account.methods.google;
  // a way in can be removed only while another one is left
  const waysIn = passkeys.length + (google ? 1 : 0);
  const name = session.user.name;
  const thisDeviceListed = sessions.some((s) => s.current);
  const founded = (communities ?? []).filter((c) => c.isFounder);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="mt-1 text-sm text-slate-500">The same account in every community.</p>
      </div>

      {loadError && (
        <Card role="alert">
          <p className="text-sm text-slate-600">
            Couldn't refresh your account, so this may be out of date: {loadError}
          </p>
          <Button size="sm" className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3">
          <Avatar person={session.user} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{name}</p>
            <p className="truncate text-[13px] text-slate-500">
              {account.profile.bio || "No profile text yet."}
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)}>
            <UserPen size={14} /> Edit profile
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle hint="Ways into this account. Keeping two means losing one doesn't lock you out.">
          How you sign in
        </CardTitle>
        <ul className="divide-y divide-slate-100">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <KeyRound size={18} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{passkeyKind(p.transports)}</p>
                <p className="text-[13px] text-slate-500">
                  Added {formatDate(p.createdAt)}
                  {p.lastUsedAt && ` · last used ${formatDate(p.lastUsedAt)}`}
                </p>
                {waysIn <= 1 && (
                  <p id={`only-${p.id}`} className="text-[13px] text-amber-700">
                    Your only way to sign in, so it can't be removed: add another first.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="danger"
                disabled={busy !== undefined || waysIn <= 1}
                aria-label={`Remove ${passkeyKind(p.transports).toLowerCase()} added ${formatDate(p.createdAt)}`}
                aria-describedby={waysIn <= 1 ? `only-${p.id}` : undefined}
                onClick={change(`passkey:${p.id}`, async () => {
                  if (!confirm("Remove this passkey? It won't sign you in to Anthill any more.")) return;
                  await removePasskey(session, setSession, p.id);
                  patch((l) => ({ ...l, passkeys: l.passkeys.filter((x) => x.id !== p.id) }));
                  return "Passkey removed.";
                })}
              >
                Remove
              </Button>
            </li>
          ))}
          {passkeys.length === 0 && (
            <li className="py-2.5 text-sm text-slate-500">
              No passkeys yet. Add one, so you can sign in without Google too.
            </li>
          )}
          {(google || googleOffered) && (
            <li className="flex items-center gap-3 py-2.5">
              <GoogleMark size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">Google</p>
                <p className="truncate text-[13px] text-slate-500">
                  {google ? (google.email ? `${google.email} · only you see this` : "A Google account") : "Not linked"}
                </p>
                {google && passkeys.length === 0 && (
                  <p id="only-google" className="text-[13px] text-amber-700">
                    Your only way to sign in, so it can't be unlinked: add a passkey first.
                  </p>
                )}
              </div>
              {google ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy !== undefined || passkeys.length === 0}
                  aria-label={google.email ? `Unlink Google account ${google.email}` : "Unlink a Google account"}
                  aria-describedby={passkeys.length === 0 ? "only-google" : undefined}
                  onClick={change("google", async () => {
                    const ask =
                      `Unlink ${google.email ?? "your Google account"}? You won't be able to sign in with it. ` +
                      "Its email is erased from Anthill; Google's id for the account stays in Anthill's log.";
                    if (!confirm(ask)) return;
                    await unlinkGoogle(session, setSession);
                    patch((l) => ({ ...l, account: { ...l.account, methods: { ...l.account.methods, google: null } } }));
                    return "Google unlinked.";
                  })}
                >
                  Unlink
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy !== undefined}
                  onClick={change("google", () => linkGoogle(session, setSession))}
                >
                  Link
                </Button>
              )}
            </li>
          )}
        </ul>
        <Button
          size="sm"
          className="mt-3"
          disabled={busy !== undefined}
          onClick={change("add", async () => {
            await addPasskey(session, setSession);
            return "Passkey added: you can sign in with it too.";
          })}
        >
          <KeyRound size={14} /> Add a passkey on this device
        </Button>
      </Card>

      <Card>
        <CardTitle
          hint={
            account.methods.recoveryCode
              ? "You have one. If you lose every way to sign in, it gets you back in."
              : "You don't have one. If you lose every way to sign in, one gets you back in."
          }
        >
          Recovery code
        </CardTitle>
        <Button
          size="sm"
          disabled={busy !== undefined}
          onClick={change("recovery", async () => {
            if (account.methods.recoveryCode && !confirm("Make a new recovery code? Your current one stops working.")) {
              return;
            }
            showRecoveryCode(await newRecoveryCode(session, setSession));
          })}
        >
          <RefreshCw size={14} /> {account.methods.recoveryCode ? "Make a new recovery code" : "Make a recovery code"}
        </Button>
      </Card>

      <Card>
        <CardTitle hint="Where your account is signed in now. End any you don't recognise.">Sessions</CardTitle>
        <ul className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <Monitor size={18} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate">{s.device || "Unknown device"}</span>
                  {s.current && <Badge tone="accent">This device</Badge>}
                </p>
                <p className="text-[13px] text-slate-500">
                  {MADE_BY[s.method] ?? "Signed in"} · {formatDate(s.createdAt)}
                </p>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy !== undefined}
                  aria-label={`End the session on ${s.device || "an unknown device"}, from ${formatDate(s.createdAt)}`}
                  onClick={change(`session:${s.id}`, async () => {
                    await endSession(session, s.id);
                    patch((l) => ({ ...l, sessions: l.sessions.filter((x) => x.id !== s.id) }));
                    return "Session ended.";
                  })}
                >
                  End
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!thisDeviceListed && (
          <p className="mt-1 text-[13px] text-slate-500">
            This device signed in before sessions were listed, so it isn't shown. Signing out
            everywhere ends it too.
          </p>
        )}
        <Button
          size="sm"
          className="mt-3"
          disabled={busy !== undefined}
          onClick={() =>
            leave("everywhere", "Sign out everywhere, this device too? Your passkeys and Google stay.", async () => {
              await signOutEverywhere(session);
              return "Signed out everywhere.";
            })
          }
        >
          <LogOut size={14} /> Sign out everywhere
        </Button>
      </Card>

      <Card>
        <CardTitle hint="A file with everything Anthill holds about your account: profile, ways to sign in (not the keys), sessions, and what you did in each community.">
          Your data
        </CardTitle>
        <Button
          size="sm"
          disabled={busy !== undefined}
          onClick={change("export", async () => {
            await downloadMyData(session);
          })}
        >
          <Download size={14} /> {busy === "export" ? "Preparing…" : "Download my data"}
        </Button>
      </Card>

      <Card className="border-red-100">
        <CardTitle>Delete your account</CardTitle>
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            You leave every community you're in. Each one records it like any leave: your
            endorsements there go, and the people under you move up. Your profile, passkeys,
            Google link and recovery code stop working and are no longer shown, your Google email
            is erased, and every session ends. The account is renamed "Deleted account" and can
            never sign in again.
          </p>
          {founded.length > 0 && (
            <p>
              You started {founded.map((c) => c.name).join(", ")}. A community whose founder is
              deleted has none: whoever is at the root of its tree then decides its name,
              description, who can see it and how people join. If nobody is left in it, anyone can
              start it again when it's public and not closed; a private one stays hidden for good.
            </p>
          )}
          <p>
            Anthill's history is an append-only log, so what's already in it stays there for good.
            Your past names, actions and votes still show in communities' histories. The rest
            isn't shown to anyone, but the people who run Anthill's server can read it in the log
            and its backups: Google's id for your account, your bio and link, your passkeys'
            public keys, your recovery code's hash, and your sessions' dates and device labels.
            Your Google email is kept outside the log, so it's erased. Download your data first if
            you want a copy.
          </p>
        </div>
        <Field
          label={`Type your name, ${name}, to confirm`}
          value={confirmName}
          onChange={(v) => {
            setConfirmName(v);
            setDeleteError("");
          }}
          maxLength={40}
          error={deleteError}
        />
        <Button
          variant="danger"
          className="mt-3 border border-red-200"
          disabled={busy !== undefined || asShown(confirmName) === "" || asShown(confirmName) !== asShown(name)}
          onClick={() =>
            leave("delete", undefined, async () => {
              await deleteAccount(session, setSession, confirmName.trim());
              return "Your account was deleted.";
            }, setDeleteError)
          }
        >
          <Trash2 size={15} /> {busy === "delete" ? "Deleting…" : "Delete my account"}
        </Button>
      </Card>

      <SiteFooter />
      {editing && <ProfileModal session={session} onClose={() => (setEditing(false), load())} />}
    </div>
  );
}
