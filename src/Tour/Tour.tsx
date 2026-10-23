// Guided tour: steps through the real page, darkening everything except the
// element being explained and putting a card with the explanation next to it.
// A step without a target (or whose target isn't on the page) shows the card
// in the middle; optional steps are skipped instead.
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type TourStep = {
  title: string;
  body: ReactNode;
  // the element to highlight; looked up repeatedly, as the page can move
  target?: () => Element | null;
  // skip this step when the target isn't on the page
  optional?: boolean;
  // run when the step opens / closes (e.g. open a node's card)
  onEnter?: () => void;
  onLeave?: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6; // space between the element and the spotlight edge
const CARD_WIDTH = 360;
const MARGIN = 12;

function rectOf(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + 2 * PAD,
    height: r.height + 2 * PAD,
  };
}

export function Tour(props: { steps: TourStep[]; onClose: () => void }) {
  const { steps, onClose } = props;
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);
  const direction = useRef(1);
  const step = steps[index];

  // enter/leave hooks, and skipping optional steps whose target is missing
  useEffect(() => {
    step.onEnter?.();
    const check = setTimeout(() => {
      if (step.optional && !rectOf(step.target?.())) {
        const next = index + direction.current;
        if (next >= 0 && next < steps.length) setIndex(next);
        else onClose();
      }
    }, 400);
    return () => {
      clearTimeout(check);
      step.onLeave?.();
    };
  }, [step, index, steps.length, onClose]);

  // keep the spotlight on the element as the page animates / scrolls / resizes
  useEffect(() => {
    const update = () => setRect(rectOf(step.target?.()));
    update();
    const timer = setInterval(update, 150);
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
      if (e.key === "ArrowRight" || e.key === "Enter") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Card next to the element: below if it fits, else above, else beside it,
  // else in the middle of the screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - 2 * MARGIN);
  let cardStyle: React.CSSProperties = {
    left: (vw - width) / 2,
    top: Math.max(MARGIN, (vh - cardHeight) / 2),
    width,
  };
  if (rect) {
    const clampLeft = (x: number) => Math.min(Math.max(MARGIN, x), vw - width - MARGIN);
    const centredLeft = clampLeft(rect.left + rect.width / 2 - width / 2);
    if (rect.top + rect.height + MARGIN + cardHeight < vh) {
      cardStyle = { left: centredLeft, top: rect.top + rect.height + MARGIN, width };
    } else if (rect.top - MARGIN - cardHeight > 0) {
      cardStyle = { left: centredLeft, top: rect.top - MARGIN - cardHeight, width };
    } else if (rect.left + rect.width + MARGIN + width < vw) {
      cardStyle = {
        left: rect.left + rect.width + MARGIN,
        top: Math.max(MARGIN, Math.min(rect.top, vh - cardHeight - MARGIN)),
        width,
      };
    } else if (rect.left - MARGIN - width > 0) {
      cardStyle = {
        left: rect.left - MARGIN - width,
        top: Math.max(MARGIN, Math.min(rect.top, vh - cardHeight - MARGIN)),
        width,
      };
    }
  }

  const last = index === steps.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Anthill tour">
      {/* blocks the page while touring; clicking it does nothing */}
      <div className="tour-blocker" />
      <div
        className={`tour-spotlight${rect ? "" : " tour-spotlight--none"}`}
        style={rect ?? { top: vh / 2, left: vw / 2, width: 0, height: 0 }}
      />
      <div className="tour-card" ref={cardRef} style={cardStyle}>
        <button type="button" className="tutorial-close" aria-label="End tour" onClick={onClose}>
          ×
        </button>
        <div className="tour-count">
          {index + 1} of {steps.length}
        </div>
        <h2 className="tour-title">{step.title}</h2>
        <div className="tour-body">{step.body}</div>
        <div className="tutorial-nav">
          <button type="button" disabled={index === 0} onClick={() => go(-1)}>
            Back
          </button>
          <button type="button" className="tutorial-primary" onClick={() => go(1)}>
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
