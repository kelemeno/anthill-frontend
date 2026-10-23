// The replay's controls, over the bottom of the tree: what just happened,
// play/pause, step by step, a timeline to scrub, speed, a link to share, close.
import { ChevronLeft, ChevronRight, Link2, Pause, Play, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { cx } from "../ui";

export const SPEEDS = [1, 2, 4];

export function ReplayBar(props: {
  steps: number | undefined; // undefined while loading
  step: number;
  playing: boolean;
  speed: number;
  caption: string;
  shareUrl: string;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (step: number) => void;
  onSpeed: (speed: number) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { steps, step } = props;
  const atEnd = steps !== undefined && step >= steps - 1;
  const iconButton =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40";

  return (
    <div
      className="absolute inset-x-2 bottom-2 z-20 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:inset-x-3 sm:bottom-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="min-w-0 truncate text-sm font-medium text-slate-900" aria-live="polite">
          {steps === undefined ? "Loading the history…" : steps === 0 ? "Nothing has happened here yet." : props.caption}
        </p>
        {steps !== undefined && steps > 0 && (
          <span className="num shrink-0 text-[12px] text-slate-400">
            {step + 1} / {steps}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          aria-label={props.playing ? "Pause" : atEnd ? "Play again" : "Play"}
          title={props.playing ? "Pause (space)" : "Play (space)"}
          disabled={!steps}
          onClick={props.playing ? props.onPause : props.onPlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {props.playing ? <Pause size={16} /> : atEnd ? <RotateCcw size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button type="button" aria-label="Previous step" title="Previous step (←)" disabled={!steps || step === 0} onClick={() => props.onSeek(step - 1)} className={iconButton}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" aria-label="Next step" title="Next step (→)" disabled={!steps || atEnd} onClick={() => props.onSeek(step + 1)} className={iconButton}>
          <ChevronRight size={18} />
        </button>
        <input
          type="range"
          aria-label="Timeline"
          min={0}
          max={Math.max(0, (steps ?? 1) - 1)}
          value={step}
          disabled={!steps}
          onChange={(e) => props.onSeek(Number(e.target.value))}
          className="mx-2 h-1.5 min-w-0 flex-1 cursor-pointer accent-indigo-600"
        />
        <button
          type="button"
          title="Speed"
          onClick={() => props.onSpeed(SPEEDS[(SPEEDS.indexOf(props.speed) + 1) % SPEEDS.length])}
          className="num h-9 shrink-0 rounded-lg px-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          {props.speed}×
        </button>
        <button
          type="button"
          aria-label="Copy a link to this replay"
          title={copied ? "Link copied" : "Copy a link to this replay"}
          onClick={() => navigator.clipboard.writeText(props.shareUrl).then(() => setCopied(true))}
          className={cx(iconButton, copied && "text-emerald-600")}
        >
          <Link2 size={17} />
        </button>
        <button type="button" aria-label="Close the replay" title="Close" onClick={props.onClose} className={iconButton}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
