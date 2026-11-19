// Light or dark: the system's setting by default, or one this browser chose in
// the account menu, kept in localStorage. public/theme.js applies a stored
// choice before the page paints; this applies a new one at once, here and in
// this site's other open tabs (they hear of it through the storage event).
export type ThemeChoice = "system" | "light" | "dark";

const THEME = "anthill.theme";
// the header's colour in each scheme, for the browser's own bars (as in
// index.html)
const THEME_COLOR = { light: "#ffffff", dark: "#0f172b" };

export function storedTheme(): ThemeChoice {
  try {
    const theme = localStorage.getItem(THEME);
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

// the choice in force (the same as the stored one, unless storage is refused),
// and whoever shows it (the account menu), to follow it
let current: ThemeChoice | undefined;
const listeners = new Set<() => void>();

export const currentTheme = (): ThemeChoice => current ?? storedTheme();

export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME);
    else localStorage.setItem(THEME, choice);
  } catch {}
  applyTheme(choice);
}

function applyTheme(choice: ThemeChoice) {
  current = choice;
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  // each meta keeps its own scheme's colour, unless one is chosen
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.getAttribute("media")?.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLOR[choice === "system" ? scheme : choice];
  }
  for (const listener of listeners) listener();
}

// a choice made in another tab (or the storage cleared: key null)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === THEME || e.key === null) applyTheme(storedTheme());
  });
}
