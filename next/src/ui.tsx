// Small shared UI pieces: buttons, cards, avatars, person rows. One look across
// all screens: white cards on a light canvas, slate text, indigo for actions.
import type { ComponentProps, ReactNode } from "react";
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

export function Card(props: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        props.className,
      )}
    >
      {props.children}
    </section>
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
