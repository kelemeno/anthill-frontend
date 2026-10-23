// An invite link (/invite/:code): who invited you to which community, and
// joining its tree under them, creating a passkey first if you don't have one.
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { act, type Community, createAccount, fetchInvite, isCancel, type Session, signIn } from "../api";
import { CommunityMark } from "../components/CommunitySwitcher";
import { Skeleton } from "../components/Skeletons";
import { useApp } from "../state";
import { AppLink, Avatar, Button, Card, communityPath, Field, useAppNavigate } from "../ui";

export function InvitePage() {
  const { code = "" } = useParams();
  const { session, setSession, showRecoveryCode, reload } = useApp();
  const navigate = useAppNavigate();
  const [invite, setInvite] = useState<{ community: Community; inviter: { id: string; name: string } }>();
  const [invalid, setInvalid] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when signing in (are you in it already?)
  useEffect(() => {
    fetchInvite(code, session).then(setInvite, (e: Error) => setInvalid(e.message));
  }, [code, session?.token]);

  const home = invite ? communityPath(invite.community.id, "/") : "/";

  const join = async (s: Session, joinName: string) => {
    if (!invite) return;
    try {
      await act(s, invite.community.id, { fn: "joinTree", args: { name: joinName, invite: code } });
    } catch (e) {
      // signed in with a passkey that's already a member
      if (!/already in the tree/i.test((e as Error).message)) throw e;
    }
    reload();
    navigate(home, { global: true });
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
        <AppLink to="/" global className="mt-4 inline-block">
          <Button>Go to Anthill</Button>
        </AppLink>
      </Card>
    );
  }
  if (!invite) {
    return (
      <Card className="mx-auto max-w-md">
        <div className="flex items-center gap-3">
          <Skeleton round className="h-12 w-12" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="mt-4 h-16 w-full rounded-xl" />
        <Skeleton className="mt-4 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
        <Skeleton className="mt-5 h-9 w-full rounded-lg" />
      </Card>
    );
  }
  const { community, inviter } = invite;

  return (
    <Card className="mx-auto max-w-md">
      <div className="flex items-center gap-3">
        <Avatar person={inviter} size={48} />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{inviter.name} invited you</h1>
          <p className="text-[13px] text-slate-500">to join their community on Anthill</p>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <CommunityMark community={community} size={36} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-slate-900">
            {community.visibility === "private" && <Lock size={13} className="text-slate-400" />}
            {community.name}
          </p>
          <p className="text-[13px] text-slate-500">
            {community.members} {community.members === 1 ? "member" : "members"}
          </p>
          {community.description && <p className="mt-1 text-sm text-slate-600">{community.description}</p>}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        A community is a tree of people. You'll start right under {inviter.name}, endorse people
        above you, and earn reputation from the people who join below you.
      </p>

      {community.you ? (
        <>
          <p className="mt-4 text-sm text-slate-600">You're already in {community.name}.</p>
          <AppLink to={home} global className="mt-4 inline-block">
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
              await join(s, s.user.name);
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
