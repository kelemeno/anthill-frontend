// Guided tour: walks through the real pages, darkening everything except the
// part being explained, with a card next to it. Steps can switch pages first.
// A step whose target isn't on the page shows its card in the middle;
// optional steps are skipped instead.
import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import { Button } from "../ui";

export type TourStep = {
  title: string;
  body: ReactNode;
  // a data-tour name to spotlight
  target?: string;
  // the page to show first
  path?: string;
  optional?: boolean;
};

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const MARGIN = 12;

// the first visible element with this data-tour name (e.g. the nav is in the
// header on desktop and at the bottom on phones)
function visible(name: string | undefined): Element | undefined {
  if (!name) return undefined;
  return [...document.querySelectorAll(`[data-tour="${name}"]`)].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function rectOf(name: string | undefined): Rect | null {
  const el = visible(name);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // keep big targets within the screen
  const top = Math.max(r.top - PAD, 4);
  const bottom = Math.min(r.bottom + PAD, window.innerHeight - 4);
  return { top, left: r.left - PAD, width: r.width + 2 * PAD, height: Math.max(bottom - top, 0) };
}

export function Tour(props: { steps: TourStep[]; navigate: NavigateFunction; onClose: () => void }) {
  const { steps, navigate, onClose } = props;
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);
  const direction = useRef(1);
  const step = steps[index];

  // Read through refs so this runs only when the step changes (not on every
  // re-render of the app, which would navigate in a loop).
  const latest = useRef({ steps, navigate, onClose });
  latest.current = { steps, navigate, onClose };

  // switch page, scroll the target into view, skip missing optional steps
  useEffect(() => {
    const { steps, navigate, onClose } = latest.current;
    const step = steps[index];
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const here = window.location.pathname.replace(/\/$/, "") || "/";
    if (step.path && here !== (base + step.path).replace(/\/$/, "")) {
      // keep ?as= (preview) when switching pages
      navigate({ pathname: step.path, search: window.location.search });
    }
    const scroll = setTimeout(() => {
      visible(step.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    const skip = setTimeout(() => {
      if (step.optional && !rectOf(step.target)) {
        const next = index + direction.current;
        if (next >= 0 && next < steps.length) setIndex(next);
        else onClose();
      }
    }, 800);
    return () => {
      clearTimeout(scroll);
      clearTimeout(skip);
    };
  }, [index]);

  useEffect(() => {
    const update = () => setRect(rectOf(step.target));
    update();
    const timer = setInterval(update, 120);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", update);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  });

  const go = useCallback(
    (delta: number) => {
      direction.current = delta;
      const next = index + delta;
      if (next < 0) return;
      if (next >= steps.length) onClose();
      else setIndex(next);
    },
    [index, steps.length, onClose],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 2 * MARGIN);
  let pos = { left: (vw - width) / 2, top: Math.max(MARGIN, (vh - cardHeight) / 2) };
  if (rect) {
    const left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - width / 2), vw - width - MARGIN);
    if (rect.top + rect.height + MARGIN + cardHeight < vh) pos = { left, top: rect.top + rect.height + MARGIN };
    else if (rect.top - MARGIN - cardHeight > 0) pos = { left, top: rect.top - MARGIN - cardHeight };
    else if (rect.left + rect.width + MARGIN + width < vw)
      pos = { left: rect.left + rect.width + MARGIN, top: Math.max(MARGIN, Math.min(rect.top, vh - cardHeight - MARGIN)) };
    else if (rect.left - MARGIN - width > 0)
      pos = { left: rect.left - MARGIN - width, top: Math.max(MARGIN, Math.min(rect.top, vh - cardHeight - MARGIN)) };
    else pos = { left, top: vh - cardHeight - MARGIN };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="absolute inset-0" />
      <div
        className="pointer-events-none fixed rounded-2xl shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] transition-all duration-300"
        style={rect ?? { top: vh / 2, left: vw / 2, width: 0, height: 0 }}
      />
      <div
        ref={cardRef}
        className="fixed rounded-2xl bg-white p-5 shadow-2xl transition-all duration-300"
        style={{ ...pos, width }}
      >
        <button
          type="button"
          aria-label="End tour"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
        <p className="text-[12px] font-semibold text-indigo-600">
          {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 pr-6 text-[16px] font-semibold text-slate-900">{step.title}</h2>
        <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</div>
        <div className="mt-4 flex justify-between gap-2">
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => go(-1)}>
            Back
          </Button>
          <Button size="sm" variant="primary" onClick={() => go(1)}>
            {index === steps.length - 1 ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// The tour's steps: the full walkthrough for members (or a previewed member),
// a shorter one for visitors.
export function tourSteps(context: { member: boolean; signedIn: boolean }): TourStep[] {
  const steps: TourStep[] = [
    {
      title: "Welcome to Anthill",
      path: "/",
      body: (
        <p>
          A tree of people where reputation comes from the people around you. This tour shows
          each part of the app; use Next, or the arrow keys.
        </p>
      ),
    },
    {
      title: "Four places",
      target: "nav",
      body: (
        <p>
          <strong>You</strong> is your overview, <strong>Explore</strong> the whole tree,{" "}
          <strong>Polls</strong> the questions people vote on, <strong>People</strong> everyone
          by reputation.
        </p>
      ),
    },
  ];
  if (context.member) {
    steps.push(
      {
        title: "Your standing",
        target: "you-header",
        path: "/",
        body: (
          <p>
            Your reputation, your rank, which level of the tree you're on and who's directly
            above you (your parent).
          </p>
        ),
      },
      {
        title: "Next steps",
        target: "next-steps",
        body: (
          <p>
            What would move you forward: how close you are to swapping places with your parent,
            people you can endorse right now, and free spots to invite people into.
          </p>
        ),
      },
      {
        title: "Where your reputation comes from",
        target: "sources",
        optional: true,
        body: (
          <p>
            Everyone starts with 1. Each person who endorses you adds a share of their
            reputation, split between everyone they endorse.
          </p>
        ),
      },
      {
        title: "Who you endorse",
        target: "endorsing",
        optional: true,
        body: <p>Your reputation is split between these people. Remove an endorsement any time.</p>,
      },
      {
        title: "Your neighbourhood",
        target: "neighbourhood",
        optional: true,
        body: <p>The people right around you in the tree. Click anyone to open their page.</p>,
      },
    );
  } else {
    steps.push({
      title: "Look around as a member",
      target: "preview",
      path: "/",
      optional: true,
      body: <p>Pick anyone to see the app from their point of view, read-only, before you join.</p>,
    });
  }
  steps.push(
    {
      title: "The whole tree",
      target: "explore-tree",
      path: "/explore",
      body: (
        <p>
          Bigger circles have more reputation. Click someone to see their card, what you can do
          with them, and their endorsements drawn as arcs. Drag to move, scroll or pinch to zoom.
        </p>
      ),
    },
    {
      title: "Find someone",
      target: "explore-search",
      body: <p>Search by name to jump straight to them.</p>,
    },
    {
      title: "Polls",
      target: "polls",
      path: "/polls",
      body: (
        <p>
          Anyone in the tree can ask a question. Votes are weighted by reputation, and whoever
          asked can close the poll to freeze the result.
        </p>
      ),
    },
    {
      title: "People",
      target: "people",
      path: "/people",
      body: <p>Everyone ranked by reputation. Filter to who you can endorse, or who has a free spot.</p>,
    },
    context.signedIn
      ? {
          title: "Your account",
          target: "account",
          path: "/",
          body: (
            <p>
              Invite someone, edit your profile, add a passkey on another device, or make a new
              recovery code. You can replay this tour from here too.
            </p>
          ),
        }
      : {
          title: "Joining",
          target: "signin",
          path: "/",
          body: (
            <p>
              Sign in with a passkey (Face ID, Touch ID or your phone). New? Open the invite link
              someone sent you, so you start right next to them.
            </p>
          ),
        },
  );
  return steps;
}
