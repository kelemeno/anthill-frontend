// Header controls for the passkey account: sign in / create / recover when
// signed out; a menu for invites, profile, extra passkeys, recovery code and
// sign-out when signed in. Replaces the old wallet button.
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { type ReactNode, useEffect, useState } from "react";

import { getNodeFromServer } from "../ExternalConnections/BackendGetters";
import { createInvite, inviteLink, saveProfile } from "../ExternalConnections/Community";
import {
  addPasskey,
  createPasskey,
  newRecoveryCode,
  recoverAccount,
  type Session,
  signInWithPasskey,
} from "../ExternalConnections/Passkey";

type Props = {
  backendUrl: string;
  session: Session | undefined;
  setSession: (session: Session | undefined) => void;
};

// Cancelling the browser's passkey sheet isn't worth an error message.
function isCancel(error: unknown) {
  return (error as Error).name === "NotAllowedError";
}

export function AccountControls(props: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<
    "create" | "recover" | "profile" | "invite" | "code" | null
  >(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const api = { backendUrl: props.backendUrl, session: props.session };

  const showCode = (code: string) => {
    setRecoveryCode(code);
    setDialog("code");
  };

  const signIn = async () => {
    setBusy(true);
    try {
      props.setSession(await signInWithPasskey(props.backendUrl));
    } catch (error) {
      if (!isCancel(error)) alert((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const menuAction = (run: () => Promise<void> | void) => async () => {
    setMenuAnchor(null);
    try {
      await run();
    } catch (error) {
      if (!isCancel(error)) alert((error as Error).message);
    }
  };

  return (
    <>
      {props.session === undefined ? (
        <div className="AccountButtons">
          <button type="button" disabled={busy} onClick={signIn}>
            Sign in with passkey
          </button>
          <button type="button" disabled={busy} onClick={() => setDialog("create")}>
            Create passkey
          </button>
          <button type="button" className="LinkButton" onClick={() => setDialog("recover")}>
            Lost your passkey?
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            {props.session.user.name} ▾
          </button>
          <Menu
            anchorEl={menuAnchor}
            open={menuAnchor !== null}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem onClick={menuAction(() => setDialog("invite"))}>
              Invite someone
            </MenuItem>
            <MenuItem onClick={menuAction(() => setDialog("profile"))}>
              Edit profile
            </MenuItem>
            <MenuItem
              onClick={menuAction(async () => {
                await addPasskey(api);
                alert("Passkey added. You can now sign in with it too.");
              })}
            >
              Add a passkey on this device
            </MenuItem>
            <MenuItem
              onClick={menuAction(async () => {
                if (confirm("Make a new recovery code? Your current one will stop working.")) {
                  showCode(await newRecoveryCode(api));
                }
              })}
            >
              New recovery code
            </MenuItem>
            <MenuItem onClick={menuAction(() => props.setSession(undefined))}>
              Sign out
            </MenuItem>
          </Menu>
        </>
      )}

      {dialog === "create" && (
        <TextDialog
          title="Create your passkey"
          label="Your name in the tree"
          action="Create passkey"
          maxLength={40}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const session = await createPasskey(props.backendUrl, name);
            props.setSession(session);
            showCode(session.recoveryCode);
          }}
        />
      )}
      {dialog === "recover" && (
        <TextDialog
          title="Recover your account"
          label="Recovery code"
          action="Create new passkey"
          help="Enter the recovery code you saved when you created your account. You'll get a new passkey and a new recovery code."
          onClose={() => setDialog(null)}
          onSubmit={async (code) => {
            const session = await recoverAccount(props.backendUrl, code);
            props.setSession(session);
            showCode(session.recoveryCode);
          }}
        />
      )}
      {dialog === "code" && (
        <RecoveryCodeDialog code={recoveryCode} onClose={() => setDialog(null)} />
      )}
      {dialog === "invite" && props.session && (
        <InviteDialog api={api} onClose={() => setDialog(null)} />
      )}
      {dialog === "profile" && props.session && (
        <ProfileDialog api={api} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// One text field and a submit button; shows the error from onSubmit inline.
function TextDialog(props: {
  title: string;
  label: string;
  action: string;
  help?: ReactNode;
  maxLength?: number;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (value.trim() === "") return;
    setBusy(true);
    setError("");
    try {
      await props.onSubmit(value.trim());
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="xs">
      <DialogTitle>{props.title}</DialogTitle>
      <DialogContent>
        {props.help && <p className="DialogHelp">{props.help}</p>}
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={props.label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          slotProps={{ htmlInput: { maxLength: props.maxLength } }}
          error={error !== ""}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || value.trim() === ""} onClick={submit}>
          {props.action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RecoveryCodeDialog(props: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="xs">
      <DialogTitle>Save your recovery code</DialogTitle>
      <DialogContent>
        <p className="DialogHelp">
          If you ever lose all your passkeys, this code gets you back into your
          account. It's shown only once: put it in a password manager or write it
          down.
        </p>
        <code className="RecoveryCode">{props.code}</code>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() =>
            navigator.clipboard.writeText(props.code).then(() => setCopied(true))
          }
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="contained" onClick={props.onClose}>
          I've saved it
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function InviteDialog(props: {
  api: { backendUrl: string; session: Session | undefined };
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setError("");
    try {
      setLink(inviteLink((await createInvite(props.api)).code));
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>Invite someone</DialogTitle>
      <DialogContent>
        <p className="DialogHelp">
          Whoever opens the link joins the tree under you, or at the nearest free
          spot below you. Each link works once and expires after 14 days.
        </p>
        {link && <TextField fullWidth value={link} slotProps={{ htmlInput: { readOnly: true } }} />}
        {error && <p className="DialogError">{error}</p>}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Close</Button>
        {link ? (
          <Button
            variant="contained"
            onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        ) : (
          <Button variant="contained" onClick={make}>
            Create invite link
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function ProfileDialog(props: {
  api: { backendUrl: string; session: Session | undefined };
  onClose: () => void;
}) {
  const [bio, setBio] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const id = props.api.session?.user.id ?? "";
  // prefill from the current profile (only nodes in the tree are in the graph)
  useEffect(() => {
    getNodeFromServer(props.api.backendUrl, id).then(
      (node) => {
        setBio(node.bio ?? "");
        setLink(node.link ?? "");
      },
      () => {},
    );
  }, [props.api.backendUrl, id]);
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>Your profile</DialogTitle>
      <DialogContent>
        <p className="DialogHelp">Shown to people when they look at your node.</p>
        <TextField
          fullWidth
          multiline
          minRows={2}
          margin="dense"
          label="About you"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 280 } }}
          helperText={`${bio.length}/280`}
        />
        <TextField
          fullWidth
          margin="dense"
          label="Link (optional)"
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        {error && <p className="DialogError">{error}</p>}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={async () => {
            try {
              await saveProfile(props.api, bio, link);
              props.onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
