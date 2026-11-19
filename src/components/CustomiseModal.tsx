// Customise, for whoever may change a community's settings: which pages its
// site shows, its accent colour (with a live preview), and its About text
// (Markdown, with a preview). It loads the site first, as a save replaces all
// of it, About included. Closing it with changes not saved asks first: an About
// can be pages long, and Escape or a click beside the dialog is easy to do.
import { Check } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";

import { type Community, fetchSite, type Site, type SitePage, saveSite } from "../api";
import { viewerKey } from "../cache";
import { Markdown } from "../markdown";
import { rememberAbout } from "../pages/About";
import {
  ABOUT_MAX,
  ACCENT_LABELS,
  ACCENTS,
  cleanAbout,
  DEFAULT_ACCENT,
  isAccent,
  PAGE_LABELS,
  pagesOf,
  SITE_PAGES,
} from "../site";
import { useApp } from "../state";
import { arrowKeys, Badge, Button, cx, FIELD_FOCUS, Modal } from "../ui";
import { Skeleton } from "./Skeletons";

const PAGE_HINTS: Record<SitePage, string> = {
  explore: "The whole tree, and its replay.",
  polls: "Questions people vote on.",
  people: "Everyone by reputation.",
  agents: "Connecting members' agents to the commons.",
};

export function CustomiseModal(props: { community: Community; onClose: () => void }) {
  const { session, reload, notify } = useApp();
  const { community } = props;
  const hasCommons = Boolean(community.commons);
  const [site, setSite] = useState<Site>();
  // the site as loaded, to tell whether anything has changed
  const [loaded, setLoaded] = useState<Site>();
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const id = useId();
  const aboutId = `${id}-about`;
  const helpId = `${id}-help`;

  // once, when it opens: a later answer mustn't replace what's being edited
  // biome-ignore lint/correctness/useExhaustiveDependencies: the session it opened with
  useEffect(() => {
    let live = true;
    fetchSite(community.id, session).then(
      (s) => {
        if (!live) return;
        const site = {
          pages: pagesOf(s.pages, hasCommons),
          accent: isAccent(s.accent) ? s.accent : DEFAULT_ACCENT,
          about: typeof s.about === "string" ? s.about : "",
        };
        setLoaded(site);
        setSite(site);
      },
      (e: Error) => live && setLoadError(e.message),
    );
    return () => {
      live = false;
    };
  }, [community.id, hasCommons]);

  const set = (changes: Partial<Site>) => site && setSite({ ...site, ...changes });
  // counted as the server counts it
  const aboutLength = cleanAbout(site?.about ?? "").length;
  const tooLong = aboutLength > ABOUT_MAX;
  const changed = site !== undefined && JSON.stringify(site) !== JSON.stringify(loaded);
  // (not after a save: then nothing is lost)
  const close = () => {
    if (changed && !window.confirm("Discard your changes?")) return;
    props.onClose();
  };

  const save = async () => {
    if (!session || !site) return;
    setBusy(true);
    setError("");
    try {
      // (Agents stays off without a commons: the server refuses it)
      await saveSite(session, community.id, { ...site, pages: { ...site.pages, agents: hasCommons && site.pages.agents } });
      rememberAbout(viewerKey(session), community.id, cleanAbout(site.about));
      reload();
      notify("Saved. Everyone sees the new look now.");
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Customise ${community.name}`}
      wide="extra"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !site || tooLong} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {loadError ? (
        <p role="alert" className="text-[13px] text-red-600">Couldn't load this community's site, so nothing can be saved yet: {loadError}</p>
      ) : !site ? (
        <div aria-hidden className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <Section
            title="Pages"
            hint="You, the community's home, is always there. Turning a page off only hides it on this site: nothing in it is deleted and no rule changes, and turning it back on brings it all back."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {SITE_PAGES.filter((p) => p !== "agents" || hasCommons).map((page) => (
                <Toggle
                  key={page}
                  label={PAGE_LABELS[page]}
                  hint={PAGE_HINTS[page]}
                  on={site.pages[page]}
                  onChange={(on) => set({ pages: { ...site.pages, [page]: on } })}
                />
              ))}
            </div>
          </Section>

          <Section title="Colour" hint="For buttons, links and what's selected, in light and dark.">
            <div
              role="radiogroup"
              aria-label="Accent colour"
              className="flex flex-wrap gap-2"
              onKeyDown={arrowKeys(ACCENTS, site.accent, (accent) => set({ accent }))}
            >
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  role="radio"
                  aria-checked={site.accent === accent}
                  tabIndex={site.accent === accent ? 0 : -1}
                  aria-label={ACCENT_LABELS[accent]}
                  title={ACCENT_LABELS[accent]}
                  data-accent={accent}
                  onClick={() => set({ accent })}
                  className={cx(
                    "flex h-9 w-9 items-center justify-center rounded-full bg-accent-solid text-white transition-shadow",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
                    site.accent === accent && "ring-2 ring-accent-500 ring-offset-2 ring-offset-surface",
                  )}
                >
                  {site.accent === accent && <Check size={16} />}
                </button>
              ))}
            </div>
            <AccentPreview accent={site.accent} name={community.name} />
          </Section>

          <Section
            title="About"
            hint="Shown as an About tab, and to visitors on the community's front page. Leave it empty for none."
          >
            <div role="tablist" aria-label="About" className="mb-2 flex gap-1" onKeyDown={arrowKeys([false, true], preview, setPreview)}>
              {[false, true].map((p) => (
                <button
                  key={String(p)}
                  id={`${id}-${p ? "preview" : "write"}`}
                  type="button"
                  role="tab"
                  aria-selected={preview === p}
                  aria-controls={aboutId}
                  tabIndex={preview === p ? 0 : -1}
                  onClick={() => setPreview(p)}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-[13px] font-medium",
                    preview === p ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {p ? "Preview" : "Write"}
                </button>
              ))}
            </div>
            <div id={aboutId} role="tabpanel" aria-labelledby={`${id}-${preview ? "preview" : "write"}`}>
              {preview ? (
                // (in the colour being chosen, like the preview above)
                <div data-accent={site.accent} className="min-h-[12rem] rounded-lg border border-slate-200 px-4 py-3">
                  {aboutLength > 0 ? (
                    <Markdown source={site.about} />
                  ) : (
                    <p className="text-sm text-slate-500">Nothing yet: with no About, there's no About tab.</p>
                  )}
                </div>
              ) : (
                <textarea
                  aria-label="About, in Markdown"
                  aria-describedby={helpId}
                  aria-invalid={tooLong}
                  value={site.about}
                  onChange={(e) => set({ about: e.target.value })}
                  rows={10}
                  placeholder={"# What we're about\n\nWho we are, what we do, how to take part…"}
                  className={cx(
                    "w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400",
                    FIELD_FOCUS,
                  )}
                />
              )}
            </div>
            <p
              id={helpId}
              className={cx("mt-1 flex flex-wrap justify-between gap-x-3 text-[13px]", tooLong ? "text-red-600" : "text-slate-500")}
            >
              <span>
                Markdown: # headings, **bold**, *italics*, lists, `code` and [links](https://…). No images or HTML.
              </span>
              <span className="num">
                {tooLong && `Too long by ${overBy(aboutLength - ABOUT_MAX)}: `}
                {aboutLength.toLocaleString("en-US")} / {ABOUT_MAX.toLocaleString("en-US")}
              </span>
            </p>
          </Section>
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-red-600">
              {error}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

const overBy = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "character" : "characters"}`;

function Section(props: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-[13px] font-semibold text-slate-900">{props.title}</h3>
      <p className="mt-0.5 mb-2 text-[13px] text-slate-500">{props.hint}</p>
      {props.children}
    </section>
  );
}

function Toggle(props: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-accent-500"
    >
      <span
        aria-hidden
        className={cx(
          "mt-0.5 flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
          props.on ? "bg-accent-solid" : "bg-slate-300",
        )}
      >
        <span className={cx("h-4 w-4 rounded-full bg-white shadow transition-transform", props.on && "translate-x-4")} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{props.label}</span>
        <span className="block text-[13px] text-slate-600">{props.hint}</span>
      </span>
    </button>
  );
}

// The colour as it will look: a tab, a button, a badge and a link, in this
// scheme (light or dark, as the page is now).
function AccentPreview(props: { accent: string; name: string }) {
  return (
    <div
      data-accent={props.accent}
      data-testid="accent-preview"
      aria-hidden
      className="mt-3 rounded-xl border border-slate-200 bg-canvas p-3"
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2">
        <span className="text-[13px] font-semibold text-slate-900">{props.name}</span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[13px] font-medium text-slate-900">You</span>
        <span className="px-1 text-[13px] font-medium text-slate-500">Explore</span>
        <span className="ml-auto text-[13px] font-medium text-accent-600">See the tree</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" tabIndex={-1}>
          Endorse
        </Button>
        <Badge tone="accent">#3 of 40</Badge>
        <span className="text-[13px] text-slate-600">
          and a <span className="font-medium text-accent-600 underline underline-offset-2">link</span> in text
        </span>
      </div>
    </div>
  );
}
