// Small shared UI pieces: buttons, cards, avatars, person rows. One look across
// all screens: white cards on a light canvas, slate text, indigo for actions.
import { X } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";

import type { Person } from "./api";
import { colorOf, formatRep, initials, rep } from "./model";

export function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// A Link that keeps the ?as= preview parameter.
export function AppLink(props: ComponentProps<typeof Link> & { to: string }) {
  const [params] = useSearchParams();
  const as = params.get("as");
  const to = as ? `${props.to}${props.to.includes("?") ? "&" : "?"}as=${as}` : props.to;
  return <Link {...props} to={to} />;
}

export function Button(
  props: ComponentProps<"button"> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
  },
) {
  const { variant = "secondary", size = "md", className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-indigo-600 text-white hover:bg-indigo-700",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        variant === "danger" && "text-red-600 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function Card(props: ComponentProps<"section">) {
  const { className, ...rest } = props;
  return (
    <section
      {...rest}
      className={cx(
        "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    />
  );
}

export function CardTitle(props: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">{props.children}</h2>
        {props.hint && <p className="mt-0.5 text-[13px] text-slate-500">{props.hint}</p>}
      </div>
      {props.action}
    </div>
  );
}

export function Avatar(props: { person: Pick<Person, "id" | "name">; size?: number; ring?: boolean }) {
  const size = props.size ?? 36;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        props.ring && "ring-2 ring-indigo-500 ring-offset-2",
      )}
      style={{
        width: size,
        height: size,
        background: colorOf(props.person.id),
        fontSize: Math.max(10, size * 0.38),
      }}
    >
      {initials(props.person.name)}
    </span>
  );
}

export function Badge(props: { children: ReactNode; tone?: "slate" | "indigo" | "amber" | "emerald" }) {
  const tone = props.tone ?? "slate";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "slate" && "bg-slate-100 text-slate-600",
        tone === "indigo" && "bg-indigo-50 text-indigo-700",
        tone === "amber" && "bg-amber-50 text-amber-700",
        tone === "emerald" && "bg-emerald-50 text-emerald-700",
      )}
    >
      {props.children}
    </span>
  );
}

// One person in a list: avatar, name, a detail line, and something on the right.
export function PersonRow(props: {
  person: Person;
  detail?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <AppLink to={`/p/${props.person.id}`} className="flex min-w-0 flex-1 items-center gap-3 group">
        <Avatar person={props.person} size={34} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-indigo-600">
            {props.person.name}
          </span>
          <span className="block truncate text-[13px] text-slate-500">
            {props.detail ?? `${formatRep(rep(props.person))} reputation`}
          </span>
        </span>
      </AppLink>
      {props.right}
    </div>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <p className="py-3 text-sm text-slate-500">{props.children}</p>;
}

// A dialog: centred card on wide screens, bottom sheet on phones. Escape or a
// click outside closes it (when onClose is given).
export function Modal(props: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  const { onClose } = props;
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6",
          props.wide ? "sm:max-w-lg" : "sm:max-w-md",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mt-1 -mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="text-sm text-slate-600">{props.children}</div>
        {props.footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{props.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  maxLength?: number;
  multiline?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const id = useId();
  const cls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
  return (
    <div className="mt-3">
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-slate-700">
        {props.label}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          value={props.value}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          autoFocus={props.autoFocus}
          rows={3}
          onChange={(e) => props.onChange(e.target.value)}
          className={cx(cls, "py-2")}
        />
      ) : (
        <input
          id={id}
          value={props.value}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          autoFocus={props.autoFocus}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && props.onEnter?.()}
          className={cx(cls, "h-10")}
        />
      )}
      {props.error ? (
        <p className="mt-1 text-[13px] text-red-600">{props.error}</p>
      ) : (
        props.hint && <p className="mt-1 text-[13px] text-slate-500">{props.hint}</p>
      )}
    </div>
  );
}

// A dropdown menu under its button; closes on outside click or Escape.
export function Menu(props: { button: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {props.button(() => setOpen((o) => !o))}
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem(props: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cx(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-slate-50",
        props.danger ? "text-red-600" : "text-slate-700",
      )}
    >
      <span className="text-slate-400">{props.icon}</span>
      {props.children}
    </button>
  );
}

// The recovery code, shown once after creating or recovering an account.
export function RecoveryCodeModal(props: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      title="Save your recovery code"
      footer={
        <>
          <Button onClick={() => navigator.clipboard.writeText(props.code).then(() => setCopied(true))}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="primary" onClick={props.onDone}>
            I've saved it
          </Button>
        </>
      }
    >
      <p>
        If you ever lose all your passkeys, this code gets you back into your account. It's
        shown only once: put it in your password manager or write it down.
      </p>
      <code className="mt-4 block rounded-xl bg-slate-100 px-4 py-3 text-center font-mono text-base tracking-wider text-slate-900 select-all">
        {props.code}
      </code>
    </Modal>
  );
}
