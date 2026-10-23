// The signed-in account: an avatar button with a menu (your overview,
// profile, invite to this community, passkeys, recovery code, tour, sign out),
// plus the profile and invite dialogs it opens. The account and profile are
// the same in every community.
import { CircleHelp, KeyRound, Link2, LogOut, RefreshCw, User, UserPen } from "lucide-react";
import { useEffect, useState } from "react";

import {
  act,
  addPasskey,
  createInviteLink,
  fetchProfile,
  isCancel,
  newRecoveryCode,
  rename,
  saveProfile,
  type Session,
} from "../api";
import { useApp } from "../state";
import { Avatar, Button, Field, Menu, MenuItem, Modal, useAppNavigate } from "../ui";

export function AccountMenu(props: { session: Session }) {
  const { graph, cid, setSession, notify, showRecoveryCode, startTour } = useApp();
  const navigate = useAppNavigate();
  const [dialog, setDialog] = useState<"profile" | "invite">();
  const me = graph?.nodes[props.session.user.id];
  const person = me ?? { id: props.session.user.id, name: props.session.user.name };

  const safely = (work: () => Promise<void>) => () =>
    work().catch((e) => !isCancel(e) && notify((e as Error).message));

  return (
    <>
      <Menu
        button={(toggle) => (
          <button
            type="button"
            data-tour="account"
            onClick={toggle}
            className="flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 hover:bg-slate-100"
          >
            <Avatar person={person} size={30} />
            <span className="hidden max-w-[140px] truncate text-sm font-medium sm:block">{person.name}</span>
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="border-b border-slate-100 px-3.5 pt-1.5 pb-2.5">
              <p className="truncate text-sm font-semibold">{person.name}</p>
              {cid && graph && (
                <p className="truncate text-[12px] text-slate-500">
                  {me ? `In ${graph.community.name}` : `Not in ${graph.community.name} yet`}
                </p>
              )}
            </div>
            <div className="py-1">
              <MenuItem icon={<User size={16} />} onClick={() => (close(), navigate("/"))}>
                Your overview
              </MenuItem>
              <MenuItem icon={<UserPen size={16} />} onClick={() => (close(), setDialog("profile"))}>
                Edit profile
              </MenuItem>
              {me && cid && (
                <MenuItem icon={<Link2 size={16} />} onClick={() => (close(), setDialog("invite"))}>
                  Invite someone here
                </MenuItem>
              )}
              <MenuItem
                icon={<KeyRound size={16} />}
                onClick={safely(async () => {
                  close();
                  await addPasskey(props.session);
                  notify("Passkey added: you can sign in with it too.");
                })}
              >
                Add a passkey on this device
              </MenuItem>
              <MenuItem
                icon={<RefreshCw size={16} />}
                onClick={safely(async () => {
                  close();
                  if (confirm("Make a new recovery code? Your current one stops working.")) {
                    showRecoveryCode(await newRecoveryCode(props.session));
                  }
                })}
              >
                New recovery code
              </MenuItem>
              <MenuItem icon={<CircleHelp size={16} />} onClick={() => (close(), navigate("/"), startTour())}>
                Guided tour
              </MenuItem>
            </div>
            <div className="border-t border-slate-100 pt-1">
              <MenuItem icon={<LogOut size={16} />} onClick={() => (close(), setSession(undefined))}>
                Sign out
              </MenuItem>
            </div>
          </>
        )}
      </Menu>
      {dialog === "profile" && <ProfileModal session={props.session} onClose={() => setDialog(undefined)} />}
      {dialog === "invite" && cid && graph && (
        <InviteModal
          session={props.session}
          cid={cid}
          communityName={graph.community.name}
          onClose={() => setDialog(undefined)}
        />
      )}
    </>
  );
}

export function InviteModal(props: { session: Session; cid: string; communityName: string; onClose: () => void }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      title="Invite someone"
      onClose={props.onClose}
      footer={
        link ? (
          <Button variant="primary" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
            <Link2 size={15} /> {copied ? "Copied" : "Copy link"}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => createInviteLink(props.session, props.cid).then(setLink, (e: Error) => setError(e.message))}
          >
            Create invite link
          </Button>
        )
      }
    >
      <p>
        Whoever opens the link joins {props.communityName} right under you, or at the nearest
        free spot below you. Each link works once and expires after 14 days.
      </p>
      {link && (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="mt-4 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
        />
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}

function ProfileModal(props: { session: Session; onClose: () => void }) {
  const { graph, cid, notify, reload, setSession } = useApp();
  const me = graph?.nodes[props.session.user.id];
  const [name, setName] = useState(props.session.user.name);
  const [bio, setBio] = useState("");
  const [link, setLink] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProfile(props.session).then(
      (p) => {
        setBio(p.bio);
        setLink(p.link);
        setLoaded(true);
      },
      (e: Error) => setError(e.message),
    );
  }, [props.session]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (name.trim() && name.trim() !== props.session.user.name) {
        const user = await rename(props.session, name.trim());
        setSession({ ...props.session, user });
      }
      await saveProfile(props.session, bio, link);
      reload();
      notify("Profile saved.");
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!cid || !graph) return;
    const where = graph.community.name;
    if (!confirm(`Leave ${where}? Your endorsements there (given and received) are removed, and the people under you move up.`)) return;
    try {
      await act(props.session, cid, { fn: "leaveTree", args: {} });
      reload();
      notify(`You left ${where}.`);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal
      title="Your profile"
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !loaded} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <p>Shown on your page and your card in every community you're in.</p>
      <Field label="Name" value={name} onChange={setName} maxLength={40} />
      <Field label="About you" value={bio} onChange={setBio} maxLength={280} multiline hint={`${bio.length}/280`} />
      <Field label="Link (optional)" value={link} onChange={setLink} placeholder="https://" maxLength={200} />
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      {me && graph && (
        <div className="mt-6 rounded-xl border border-red-100 bg-red-50/50 p-3">
          <p className="text-[13px] text-slate-600">
            Leaving {graph.community.name} removes you and your endorsements there; the people
            under you move up. Your other communities aren't affected.
          </p>
          <Button size="sm" variant="danger" className="mt-2" onClick={leave}>
            <LogOut size={14} /> Leave {graph.community.name}
          </Button>
        </div>
      )}
    </Modal>
  );
}
