// Signing in: with a passkey, by creating an account, or by recovering one
// with the recovery code. All three live in one dialog.
import { KeyRound } from "lucide-react";
import { useState } from "react";

import { createAccount, isCancel, type Session, recoverAccount, signIn } from "../api";
import { Button, Field, Modal } from "../ui";

export type AuthMode = "signin" | "create" | "recover";

export function AuthModal(props: {
  mode: AuthMode;
  onClose: () => void;
  // the recovery code is set for new and recovered accounts
  onSession: (session: Session, recoveryCode?: string) => void;
}) {
  const [mode, setMode] = useState(props.mode);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
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
      <p>Use the passkey you created for Anthill.</p>
      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={busy}
        onClick={() => run(async () => props.onSession(await signIn()))}
      >
        <KeyRound size={16} /> Continue with passkey
      </Button>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-[13px]">
        <p>
          New here?{" "}
          <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => go("create")}>
            Create an account
          </button>
          , or open an invite link if someone sent you one.
        </p>
        <p>
          Lost your passkey?{" "}
          <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => go("recover")}>
            Recover with your code
          </button>
        </p>
      </div>
    </Modal>
  );
}
