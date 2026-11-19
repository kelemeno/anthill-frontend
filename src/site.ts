// A community's site: which of its pages it shows, its accent colour and its
// About text. Presentation only: a page that's off is hidden here, nothing in
// it is deleted and no rule changes.
//
// The accent names are shared with the backend, which checks them
// (anthill-backend src/site.ts, ACCENTS): change both together. Each one's
// colours, light and dark, are in index.css ([data-accent="…"]).
import type { Community, SitePage, SitePages, SiteSummary } from "./api";

export const ACCENTS = ["indigo", "blue", "teal", "green", "amber", "orange", "rose", "violet"] as const;
export type Accent = (typeof ACCENTS)[number];
// the look from before sites
export const DEFAULT_ACCENT: Accent = "indigo";

export const ACCENT_LABELS: Record<Accent, string> = {
  indigo: "Indigo",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  rose: "Rose",
  violet: "Violet",
};

export const isAccent = (v: unknown): v is Accent => (ACCENTS as readonly unknown[]).includes(v);

// in the order the nav shows them, after "You"
export const SITE_PAGES: readonly SitePage[] = ["explore", "polls", "people", "agents"];

export const PAGE_LABELS: Record<SitePage, string> = {
  explore: "Explore",
  polls: "Polls",
  people: "People",
  agents: "Agents",
};

export const ABOUT_MAX = 10_000;

// The About as the server keeps it (anthill-backend src/site.ts, cleanAbout:
// change both together), so the counter counts what the server checks: NFC can
// make text longer, and control characters and trailing space don't count.
// One with nothing visible is none.
export function cleanAbout(v: string): string {
  const cleaned = v
    .normalize("NFC")
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/[^\P{Cc}\t\n]/gu, "")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();
  return cleaned.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, "") === "" ? "" : cleaned;
}

// Which pages are shown, from a server's answer: a record of booleans, or a
// list of the pages shown. A page it doesn't mention is on, as on servers from
// before sites.
function pagesFrom(raw: unknown): Partial<SitePages> {
  if (Array.isArray(raw)) return Object.fromEntries(SITE_PAGES.map((p) => [p, raw.includes(p)]));
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return Object.fromEntries(SITE_PAGES.filter((p) => typeof r[p] === "boolean").map((p) => [p, r[p]]));
  }
  return {};
}

// Normalised pages: every page on unless the server says it's off, and Agents
// only where the community has an agent commons.
export function pagesOf(raw: unknown, hasCommons: boolean): SitePages {
  const given = pagesFrom(raw);
  return {
    explore: given.explore !== false,
    polls: given.polls !== false,
    people: given.people !== false,
    agents: hasCommons && given.agents !== false,
  };
}

// The site as the screens use it, for any community summary (or none yet:
// then everything on, so nothing is hidden before it's known).
export function siteOf(community: Pick<Community, "site" | "commons"> | undefined): SiteSummary {
  const site = community?.site;
  return {
    pages: pagesOf(site?.pages, Boolean(community?.commons)),
    accent: isAccent(site?.accent) ? site.accent : DEFAULT_ACCENT,
    hasAbout: site?.hasAbout === true,
  };
}

// The community's tabs: its home ("You"), the pages it shows, and About when
// it has one.
export type NavPage = "home" | SitePage | "about";

export function navPages(community: Pick<Community, "site" | "commons"> | undefined): NavPage[] {
  const { pages, hasAbout } = siteOf(community);
  return ["home", ...SITE_PAGES.filter((p) => pages[p]), ...(hasAbout ? ["about" as const] : [])];
}
