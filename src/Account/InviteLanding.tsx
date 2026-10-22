// Opened from an invite link (/?invite=CODE): says who invited you and joins
// the tree under them, creating a passkey first if you don't have one.
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useEffect, useState } from "react";

import { getIsNodeInGraph } from "../ExternalConnections/BackendGetters";
import { getInvite } from "../ExternalConnections/Community";
import {
  createPasskey,
  type Session,
  sendAction,
  signInWithPasskey,
} from "../ExternalConnections/Passkey";

export function inviteCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("invite");
}

export function InviteLanding(props: {
  code: string;
  backendUrl: string;
  session: Session | undefined;
  setSession: (session: Session | undefined) => void;
}) {
  const [open, setOpen] = useState(true);
  const [inviter, setInviter] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [inTree, setInTree] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // set after joining with a new account: the code to save before leaving
  const [recoveryCode, setRecoveryCode] = useState("");
  const [joinedAs, setJoinedAs] = useState("");

  useEffect(() => {
    getInvite(props.backendUrl, props.code).then(
      (info) => setInviter(info.inviter),
      (e: Error) => setError(e.message),
    );
  }, [props.backendUrl, props.code]);

  const userId = props.session?.user.id;
  useEffect(() => {
    if (userId === undefined) return;
    getIsNodeInGraph(props.backendUrl, userId).then(setInTree, () => {});
  }, [props.backendUrl, userId]);

  const close = () => {
    setOpen(false);
    // drop ?invite= so a reload doesn't reopen this
    window.history.replaceState(null, "", window.location.pathname);
  };

  const goToNode = (id: string) => {
    window.location.assign(`/?id=${id}`);
  };

  const join = async (session: Session, joinName: string) => {
    await sendAction(
      { backendUrl: props.backendUrl, session },
      "joinTree",
      { name: joinName, invite: props.code },
    );
    setJoinedAs(session.user.id);
  };

  const run = (work: () => Promise<void>) => async () => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if ((e as Error).name !== "NotAllowedError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createAndJoin = run(async () => {
    const session = await createPasskey(props.backendUrl, name.trim());
    props.setSession(session);
    setRecoveryCode(session.recoveryCode);
    await join(session, name.trim());
  });

  const signInAndJoin = run(async () => {
    const session = await signInWithPasskey(props.backendUrl);
    props.setSession(session);
    if (await getIsNodeInGraph(props.backendUrl, session.user.id)) {
      setInTree(true);
      return;
    }
    await join(session, session.user.name);
  });

  const joinSignedIn = run(async () => {
    if (props.session) await join(props.session, props.session.user.name);
  });

  let body;
  let actions;
  if (joinedAs) {
    body = (
      <>
        <p className="DialogHelp">You're in the tree, under {inviter?.name}.</p>
        {recoveryCode && (
          <>
            <p className="DialogHelp">
              Save your recovery code: if you ever lose all your passkeys, it gets
              you back in. It's shown only once.
            </p>
            <code className="RecoveryCode">{recoveryCode}</code>
          </>
        )}
      </>
    );
    actions = (
      <>
        {recoveryCode && (
          <Button onClick={() => navigator.clipboard.writeText(recoveryCode)}>Copy code</Button>
        )}
        <Button variant="contained" onClick={() => goToNode(joinedAs)}>
          {recoveryCode ? "I've saved it" : "Go to my node"}
        </Button>
      </>
    );
  } else if (inviter === null) {
    body = <p className="DialogHelp">{error || "Loading the invite…"}</p>;
    actions = <Button onClick={close}>Close</Button>;
  } else if (props.session && inTree) {
    body = <p className="DialogHelp">You're already in the tree.</p>;
    actions = (
      <Button variant="contained" onClick={() => goToNode(props.session!.user.id)}>
        Go to my node
      </Button>
    );
  } else if (props.session) {
    body = (
      <p className="DialogHelp">
        You're signed in as {props.session.user.name}. Join the tree under{" "}
        {inviter.name}?
      </p>
    );
    actions = (
      <>
        <Button onClick={close}>Not now</Button>
        <Button variant="contained" disabled={busy} onClick={joinSignedIn}>
          Join under {inviter.name}
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <p className="DialogHelp">
          Anthill is a reputation tree: you join next to people you know, and
          reputation comes from the votes of people near you. Pick the name others
          will see. You'll sign in with a passkey (Face ID, Touch ID or your phone);
          no password, no wallet.
        </p>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 40 } }}
        />
      </>
    );
    actions = (
      <>
        <Button disabled={busy} onClick={signInAndJoin}>
          I already have a passkey
        </Button>
        <Button
          variant="contained"
          disabled={busy || name.trim() === ""}
          onClick={createAndJoin}
        >
          Create passkey and join
        </Button>
      </>
    );
  }

  return (
    <Dialog open={open} onClose={joinedAs ? undefined : close} fullWidth maxWidth="sm">
      <DialogTitle>
        {inviter ? `${inviter.name} invited you to Anthill` : "Invite"}
      </DialogTitle>
      <DialogContent>
        {body}
        {error && inviter !== null && <p className="DialogError">{error}</p>}
      </DialogContent>
      <DialogActions>{actions}</DialogActions>
    </Dialog>
  );
}
