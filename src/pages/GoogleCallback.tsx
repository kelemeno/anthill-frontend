// Where Google sends this tab back to (/auth/google?code=…&state=…): finishes
// the sign-in (or the linking, or confirming it's you) on the server, keeps
// the session and returns to where the person was, with what they asked for
// before leaving (Start a community). The code and state leave the address bar
// at once, so they aren't kept in history or shared by accident.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { finishGoogle, type GoogleIntent, type GoogleOutcome } from "../api";
import { GoogleMark } from "../components/GoogleButton";
import { Skeleton } from "../components/Skeletons";
import { useApp } from "../state";
import { AppLink, Button, Card } from "../ui";

type Done = Extract<GoogleOutcome, { ok: true }>;

// What to say once back, and whether it should stay until closed: a
// confirmation says what to do again, and a surprise account how to undo it.
function doneMessage(outcome: Done): { message: string; stay?: boolean } {
  switch (outcome.done) {
    case "signedIn":
      return { message: "Signed in with Google." };
    case "created":
      return outcome.fromSignIn
        ? {
            message:
              "No Anthill account used that Google account, so this new one was made. Meant your passkey account? Delete this one on the account page, then sign in with your passkey and link Google there.",
            stay: true,
          }
        : { message: "Welcome to Anthill: your account is ready." };
    case "confirmed":
      return {
        message: `Thanks, that's you. Now ${outcome.action ?? "make the change"} again: nothing was changed yet.`,
        stay: true,
      };
    case "linked":
      return { message: "Google linked: you can sign in with it too." };
  }
}

const FAILED: Record<GoogleIntent, string> = {
  signin: "Couldn't sign in with Google",
  link: "Couldn't link Google",
  confirm: "Couldn't confirm it's you with Google",
};

export function GoogleCallbackPage() {
  const { session, setSession, notify, openAuth, resumeAfterSignIn } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState<Extract<GoogleOutcome, { ok: false }>>();
  // once: the flow can be finished only once (and StrictMode runs effects twice)
  const started = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, with what the page opened with
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(params);
    navigate("/auth/google", { replace: true });
    finishGoogle(query, session).then((outcome) => {
      if (!outcome.ok) {
        setFailed(outcome);
        return;
      }
      setSession(outcome.session);
      const { message, stay } = doneMessage(outcome);
      notify(message, { stay });
      navigate(outcome.returnTo, { replace: true });
      if (outcome.then) resumeAfterSignIn(outcome.then);
    });
  }, []);

  if (failed) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <GoogleMark size={18} /> {FAILED[failed.intent ?? "signin"]}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{failed.message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!session && (
            <Button
              variant="primary"
              onClick={() => {
                // from where they were (an invite, say), so signing in goes back there
                navigate(failed.returnTo, { replace: true });
                openAuth("signin");
              }}
            >
              Try again
            </Button>
          )}
          <AppLink to={failed.returnTo} global>
            <Button>Back to Anthill</Button>
          </AppLink>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md" aria-busy="true">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <GoogleMark size={18} /> Signing you in with Google…
      </h1>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-3/5" />
    </Card>
  );
}
