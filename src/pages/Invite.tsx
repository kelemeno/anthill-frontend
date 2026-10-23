// An invite link (/invite/:code): who invited you, and joining the tree under
// them, creating a passkey first if you don't have one.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { act, createAccount, fetchInvite, isCancel, type Session, signIn } from "../api";
import { formatRep, rep } from "../model";
import { useApp } from "../state";
import { AppLink, Avatar, Button, Card, Field } from "../ui";

export function InvitePage() {
  const { code = "" } = useParams();
  const { graph, session, setSession, showRecoveryCode, reload } = useApp();
  const navigate = useNavigate();
  const [inviter, setInviter] = useState<{ id: string; name: string }>();
  const [invalid, setInvalid] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchInvite(code).then(
      (r) => setInviter(r.inviter),
      (e: Error) => setInvalid(e.message),
    );
  }, [code]);

  const inTree = session !== undefined && graph?.nodes[session.user.id] !== undefined;
  const inviterNode = inviter ? graph?.nodes[inviter.id] : undefined;

  const join = async (s: Session, joinName: string) => {
    await act(s, { fn: "joinTree", args: { name: joinName, invite: code } });
    reload();
    navigate("/");
  };

  const run = (work: () => Promise<void>) => async () => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold">This invite can't be used</h1>
        <p className="mt-2 text-sm text-slate-600">{invalid}</p>
        <AppLink to="/" className="mt-4 inline-block">
          <Button>Go to Anthill</Button>
        </AppLink>
      </Card>
    );
  }
  if (!inviter) return <p className="text-slate-500">Opening the invite…</p>;

  return (
    <Card className="mx-auto max-w-md">
      <div className="flex items-center gap-3">
        <Avatar person={inviter} size={48} />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{inviter.name} invited you</h1>
          {inviterNode && (
            <p className="text-[13px] text-slate-500">{formatRep(rep(inviterNode))} reputation in Anthill</p>
          )}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Anthill is a tree of people. You'll start right under {inviter.name}, endorse people
        above you, and earn reputation from the people who join below you.
      </p>

      {inTree ? (
        <>
          <p className="mt-4 text-sm text-slate-600">You're already in the tree.</p>
          <AppLink to="/" className="mt-4 inline-block">
            <Button variant="primary">Go to your overview</Button>
          </AppLink>
        </>
      ) : session ? (
        <Button
          variant="primary"
          className="mt-5 w-full"
          disabled={busy}
          onClick={run(() => join(session, session.user.name))}
        >
          Join under {inviter.name} as {session.user.name}
        </Button>
      ) : (
        <>
          <Field
            label="Your name"
            value={name}
            onChange={setName}
            maxLength={40}
            autoFocus
            hint="You'll sign in with a passkey: Face ID, Touch ID or your phone."
          />
          <Button
            variant="primary"
            className="mt-4 w-full"
            disabled={busy || !name.trim()}
            onClick={run(async () => {
              const s = await createAccount(name.trim());
              setSession(s);
              await join(s, name.trim());
              showRecoveryCode(s.recoveryCode);
            })}
          >
            Create passkey and join
          </Button>
          <Button
            variant="ghost"
            className="mt-2 w-full"
            disabled={busy}
            onClick={run(async () => {
              const s = await signIn();
              setSession(s);
              if (graph?.nodes[s.user.id]) navigate("/");
              else await join(s, s.user.name);
            })}
          >
            I already have a passkey
          </Button>
        </>
      )}
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
    </Card>
  );
}
