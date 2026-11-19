// Signing in: with a passkey or Google, by creating an account (a passkey, or
// Google), or by recovering one with the recovery code. All live in one
// dialog. Google takes this tab to Google and back to where it was.
import { KeyRound } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { createAccount, isCancel, type Session, recoverAccount, signIn, signInWithGoogle } from "../api";
import { Button, Field, Modal } from "../ui";
import { GoogleButton, useGoogleSignIn } from "./GoogleButton";

export type AuthMode = "signin" | "create" | "recover";

export function AuthModal(props: {
  mode: AuthMode;
  // why they're asked to sign in, if it's for something (shown when creating)
  intro?: string;
  // what to open once signed in, kept across the trip to Google
  then?: "create";
  onClose: () => void;
  // the recovery code is set for new and recovered accounts
  onSession: (session: Session, recoveryCode?: string) => void;
}) {
  const [mode, setMode] = useState(props.mode);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // one passkey sheet at a time: a second one (Enter pressed twice) aborts the first
  const inFlight = useRef(false);
  const google = useGoogleSignIn();
  // back here after Google
  const location = useLocation();

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // from the sign-in view, a new account made for an unlinked Google account
  // is a surprise: the callback says so
  const withGoogle = () =>
    run(() =>
      signInWithGoogle(location.pathname + location.search, { fromSignIn: mode === "signin", then: props.then }),
    );

  const go = (next: AuthMode) => {
    setMode(next);
    setValue("");
    setError("");
  };

  if (mode === "create") {
    const submit = () =>
      value.trim() &&
      run(async () => {
        const s = await createAccount(value.trim());
        props.onSession(s, s.recoveryCode);
      });
    return (
      <Modal
        title="Create your account"
        onClose={props.onClose}
        footer={
          <>
            <Button variant="ghost" onClick={() => go("signin")}>
              I have a passkey
            </Button>
            <Button variant="primary" disabled={busy || !value.trim()} onClick={submit}>
              Create passkey
            </Button>
          </>
        }
      >
        {props.intro && <p className="mb-2 font-medium text-slate-900">{props.intro}</p>}
        <p>
          You sign in with a passkey: Face ID, Touch ID or your phone. No password, no wallet.
          Got an invite link? Open it instead, so you start next to the person who sent it.
        </p>
        <Field
          label="Your name in the tree"
          value={value}
          onChange={setValue}
          maxLength={40}
          autoFocus
          onEnter={submit}
          error={error}
        />
        {google && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <GoogleButton disabled={busy} onClick={withGoogle} />
            <p className="mt-2 text-[13px] text-slate-500">
              Your first name on Google becomes your name in the tree; you can change it later.
            </p>
          </div>
        )}
      </Modal>
    );
  }

  if (mode === "recover") {
    const submit = () =>
      value.trim() &&
      run(async () => {
        const s = await recoverAccount(value.trim());
        props.onSession(s, s.recoveryCode);
      });
    return (
      <Modal
        title="Recover your account"
        onClose={props.onClose}
        footer={
          <>
            <Button variant="ghost" onClick={() => go("signin")}>
              Back
            </Button>
            <Button variant="primary" disabled={busy || !value.trim()} onClick={submit}>
              Create new passkey
            </Button>
          </>
        }
      >
        <p>
          Enter the recovery code you saved when you made your account. You'll create a new
          passkey and get a new recovery code.
        </p>
        <Field
          label="Recovery code"
          value={value}
          onChange={setValue}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          autoFocus
          onEnter={submit}
          error={error}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Sign in to Anthill" onClose={props.onClose}>
      <p>{google ? "Use your passkey for Anthill, or the Google account you linked to it." : "Use the passkey you created for Anthill."}</p>
      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={busy}
        onClick={() => run(async () => props.onSession(await signIn()))}
      >
        <KeyRound size={16} /> Continue with passkey
      </Button>
      {google && (
        <>
          <GoogleButton className="mt-2" disabled={busy} onClick={withGoogle} />
          <p className="mt-2 text-[13px] text-slate-500">
            A Google account not linked to one yet makes a new Anthill account. Have a passkey?
            Sign in with it, then link Google on your account page.
          </p>
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-[13px]">
        <p>
          New here?{" "}
          <button type="button" className="font-medium text-accent-600 hover:underline" onClick={() => go("create")}>
            Create an account
          </button>
          , or open an invite link if someone sent you one.
        </p>
        <p>
          Lost your passkey?{" "}
          <button type="button" className="font-medium text-accent-600 hover:underline" onClick={() => go("recover")}>
            Recover with your code
          </button>
        </p>
      </div>
    </Modal>
  );
}
