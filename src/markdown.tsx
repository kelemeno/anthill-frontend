// A small, safe Markdown renderer for a community's About text, which anyone
// who may change its settings writes and every visitor reads. It builds React
// elements, never HTML: whatever the text holds shows as text (React escapes
// it), so there is no raw HTML at all, nothing to sanitise afterwards.
//
// What it knows: headings (# is the page's second level, so the page keeps one
// h1), paragraphs (a single line break stays a line break, as people writing
// an About expect), bullet and numbered lists (nested by indenting), *emphasis*
// and **strong** (or with _), `inline code`, fenced code blocks, and links:
// [text](url), [text](url "title") and <url>. Links go only to https:, http:,
// mailto: and paths on this site, with rel="noopener noreferrer nofollow ugc";
// web links open in a new tab. Everything else shows as it was written:
// HTML, entities (&amp; stays "&amp;"), images (no third-party requests),
// quotes, tables, rules, and links to anything else.
//
// Every step is linear, or bounded per character (a link's address is at most
// 2,048 characters), so long or hostile input can't stall the page, and
// nesting is capped so it can't exhaust the stack.
import type { ReactNode } from "react";
import { useMemo } from "react";

import { cx } from "./ui";

export type Inline =
  | string
  | { t: "em" | "strong"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; external: boolean; title?: string; c: Inline[] }
  | { t: "br" };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 2 | 3 | 4; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "list"; ordered: boolean; start: number; items: Block[][] };

// how deep lists may nest, and emphasis inside emphasis
const MAX_LIST_DEPTH = 6;
const MAX_EMPHASIS_DEPTH = 12;
const MAX_URL = 2048;
const MAX_TITLE = 300;

export const LINK_REL = "noopener noreferrer nofollow ugc";

//// blocks

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const ITEM = /^( {0,3})([-*+]|(\d{1,9})([.)]))(?:( {1,4})(.*))?$/;
// a thematic break ("---", "* * *"): not supported, shown as text, but it
// mustn't read as a list
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const blank = (line: string) => /^[ \t]*$/.test(line);

// leading tabs count as four spaces
function lines(source: string): string[] {
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, "    ")));
}

type ItemStart = { indent: number; ordered: boolean; marker: string; start: number; content: string; contentIndent: number };

function itemAt(line: string, depth: number): ItemStart | undefined {
  if (depth >= MAX_LIST_DEPTH || RULE.test(line)) return undefined;
  const m = ITEM.exec(line);
  if (!m) return undefined;
  const ordered = m[3] !== undefined;
  const spaces = m[5]?.length ?? 1;
  return {
    indent: m[1].length,
    ordered,
    marker: ordered ? m[4] : m[2],
    start: ordered ? Number(m[3]) : 1,
    content: m[6] ?? "",
    contentIndent: m[1].length + m[2].length + spaces,
  };
}

// Whether a line starts a block that ends a paragraph: a heading, a fence, or a
// list item (a numbered one only from 1, so "in\n1999. it" stays a sentence).
function interrupts(line: string, depth: number): boolean {
  if (HEADING.test(line) || FENCE.test(line)) return true;
  const item = itemAt(line, depth);
  return item !== undefined && item.content.trim() !== "" && (!item.ordered || item.start === 1);
}

function parseBlocks(input: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < input.length) {
    const line = input[i];
    if (blank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
      const [, indent, mark] = fence;
      const close = new RegExp(`^ {0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}[ \\t]*$`);
      const body: string[] = [];
      i++;
      while (i < input.length && !close.test(input[i])) {
        // the fence's own indent comes off its lines
        body.push(input[i].replace(new RegExp(`^ {0,${indent.length}}`), ""));
        i++;
      }
      i++; // the closing fence (or the end)
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading && heading[2].trim() !== "") {
      const level = Math.min(4, heading[1].length + 1) as 2 | 3 | 4;
      blocks.push({ t: "h", level, c: parseInline(heading[2].trim()) });
      i++;
      continue;
    }
    const first = itemAt(line, depth);
    if (first) {
      i = parseList(input, i, depth, first, blocks);
      continue;
    }
    // a paragraph, up to a blank line or another block
    const text: string[] = [line.trim()];
    i++;
    while (i < input.length && !blank(input[i]) && !interrupts(input[i], depth)) {
      text.push(input[i].trim());
      i++;
    }
    blocks.push({ t: "p", c: parseInline(text.join("\n")) });
  }
  return blocks;
}

// A list from input[i], whose first item is `first`; adds it to `blocks` and
// answers where it ends.
function parseList(input: string[], i: number, depth: number, first: ItemStart, blocks: Block[]): number {
  const items: Block[][] = [];
  let item: ItemStart | undefined = first;
  while (item) {
    const body = [item.content];
    i++;
    let lastBlank = item.content.trim() === "";
    while (i < input.length) {
      const line = input[i];
      if (blank(line)) {
        body.push("");
        lastBlank = true;
        i++;
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent >= item.contentIndent) {
        body.push(line.slice(item.contentIndent));
      } else if (!lastBlank && !itemAt(line, depth) && !interrupts(line, depth)) {
        // a lazy continuation of the item's paragraph
        body.push(line.trim());
      } else break;
      lastBlank = false;
      i++;
    }
    // trailing blank lines belong between items, not in this one
    while (body.length > 1 && blank(body[body.length - 1])) {
      body.pop();
      i--;
    }
    items.push(parseBlocks(body, depth + 1));
    // skip blank lines, then carry on if the next item is the same kind
    let j = i;
    while (j < input.length && blank(input[j])) j++;
    const next = j < input.length ? itemAt(input[j], depth) : undefined;
    if (next && next.ordered === first.ordered && next.marker === first.marker) {
      item = next;
      i = j;
    } else item = undefined;
  }
  blocks.push({ t: "list", ordered: first.ordered, start: first.start, items });
  return i;
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(lines(source), 0);
}

//// inline

// ASCII punctuation, which a backslash makes literal
const PUNCT = /[!-/:-@[-`{-~]/;
const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isPunct = (ch: string | undefined) => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);

// An unmatched (yet) run of * or _.
type Delim = { t: "delim"; ch: "*" | "_"; n: number };
type Item = Inline | Delim;

// how deeply each emphasis made here nests
const emphasisDepth = new WeakMap<object, number>();
const depthOf = (items: Item[]): number => {
  let d = 0;
  for (const it of items) if (typeof it === "object") d = Math.max(d, emphasisDepth.get(it) ?? 0);
  return d;
};
// a run of * or _ that found no partner shows as itself
const asText = (it: Item): Inline => (typeof it === "object" && it.t === "delim" ? it.ch.repeat(it.n) : it);

// A link's address, when it's one Anthill links to: https:, http: (with a
// host) and mailto:, or a path on this site ("/c/…", not "//elsewhere").
export function safeHref(raw: string): { href: string; external: boolean } | undefined {
  const url = raw.trim();
  if (url === "" || url.length > MAX_URL || /[\s\u0000-\u001f\u007f\\]/.test(url)) return undefined;
  if (url.startsWith("/")) return url.startsWith("//") ? undefined : { href: url, external: false };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol === "mailto:") return { href: parsed.href, external: false };
  if ((parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname !== "") {
    return { href: parsed.href, external: true };
  }
  return undefined;
}

type LinkSyntax = { end: number; label: string; dest: string; title?: string };

// [label](dest "title") at s[i] === "[". The label has no brackets of its own
// (no links in links); `nextBracket[k]` is the first unescaped [ or ] at or
// after k.
function linkAt(s: string, i: number, nextBracket: Int32Array): LinkSyntax | undefined {
  const close = nextBracket[i + 1];
  if (close < 0 || s[close] !== "]" || s[close + 1] !== "(") return undefined;
  let k = close + 2;
  while (s[k] === " ") k++;
  // the address: no spaces, parentheses balanced (and at most 32 deep, as in
  // CommonMark, which also keeps a failed attempt short)
  const from = k;
  let parens = 0;
  while (k < s.length && k - from <= MAX_URL) {
    const ch = s[k];
    if (s.charCodeAt(k) <= 32) break;
    if (ch === "\\" && k + 1 < s.length) {
      k += 2;
      continue;
    }
    if (ch === "(") {
      if (++parens > 32) return undefined;
    } else if (ch === ")") {
      if (parens === 0) break;
      parens--;
    }
    k++;
  }
  const dest = s.slice(from, k);
  while (s[k] === " " || s[k] === "\n") k++;
  let title: string | undefined;
  const quote = s[k];
  if (quote === '"' || quote === "'") {
    const within = s.slice(k + 1, k + 2 + MAX_TITLE).indexOf(quote);
    if (within < 0) return undefined;
    const end = k + 1 + within;
    title = s.slice(k + 1, end);
    k = end + 1;
    while (s[k] === " ") k++;
  }
  if (s[k] !== ")") return undefined;
  return { end: k + 1, label: s.slice(i + 1, close), dest: dest.replace(/\\([!-/:-@[-`{-~])/g, "$1"), title };
}

const AUTOLINK = /^<((?:https?:\/\/|mailto:)[^\s<>]{1,2048})>/i;

export function parseInline(s: string, inLink = false): Inline[] {
  const n = s.length;
  // which characters a backslash escapes
  const escaped = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (s[k] === "\\" && k + 1 < n && PUNCT.test(s[k + 1])) {
      escaped[k + 1] = 1;
      k++;
    }
  }
  const nextBracket = new Int32Array(n + 2).fill(-1);
  for (let k = n - 1; k >= 0; k--) {
    nextBracket[k] = (s[k] === "[" || s[k] === "]") && !escaped[k] ? k : nextBracket[k + 1];
  }
  // backtick runs, and for each the next run of the same length (its closer)
  const runs: { start: number; len: number; next: number }[] = [];
  for (let k = 0; k < n; k++) {
    if (s[k] !== "`" || escaped[k]) continue;
    let e = k;
    while (e < n && s[e] === "`") e++;
    runs.push({ start: k, len: e - k, next: -1 });
    k = e - 1;
  }
  const lastOfLength = new Map<number, number>();
  for (let r = runs.length - 1; r >= 0; r--) {
    runs[r].next = lastOfLength.get(runs[r].len) ?? -1;
    lastOfLength.set(runs[r].len, r);
  }
  let run = 0;

  const out: Item[] = [];
  // openers still waiting for a closer, by character: their places in `out`
  const openers: Record<"*" | "_", { delim: Delim; at: number }[]> = { "*": [], _: [] };
  let text = "";
  const flush = () => {
    if (text) out.push(text);
    text = "";
  };

  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < n && escaped[i + 1]) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (ch === "`" && !escaped[i]) {
      while (run < runs.length && runs[run].start < i) run++;
      const opener = runs[run];
      if (opener && opener.start === i) {
        const closer = opener.next >= 0 ? runs[opener.next] : undefined;
        if (closer) {
          let code = s.slice(i + opener.len, closer.start).replace(/\n/g, " ");
          if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
          flush();
          out.push({ t: "code", v: code });
          i = closer.start + closer.len;
        } else {
          text += "`".repeat(opener.len);
          i += opener.len;
        }
        continue;
      }
    }
    if (ch === "!" && s[i + 1] === "[" && !inLink) {
      // an image: shown as it was written
      const image = linkAt(s, i + 1, nextBracket);
      if (image) {
        text += s.slice(i, image.end);
        i = image.end;
        continue;
      }
    }
    if (ch === "[" && !escaped[i] && !inLink) {
      const link = linkAt(s, i, nextBracket);
      const href = link && safeHref(link.dest);
      if (link && href) {
        flush();
        out.push({ t: "a", ...href, ...(link.title ? { title: link.title } : {}), c: parseInline(link.label, true) });
        i = link.end;
        continue;
      }
      if (link) {
        // a link to somewhere it doesn't go: as written
        text += s.slice(i, link.end);
        i = link.end;
        continue;
      }
    }
    if (ch === "<" && !inLink) {
      const auto = AUTOLINK.exec(s.slice(i, i + MAX_URL + 2));
      const href = auto && safeHref(auto[1]);
      if (auto && href) {
        flush();
        out.push({ t: "a", ...href, c: [auto[1]] });
        i += auto[0].length;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && !escaped[i]) {
      let e = i;
      while (e < n && s[e] === ch) e++;
      const before = i > 0 ? s[i - 1] : undefined;
      const after = s[e];
      const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
      const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
      // (an _ inside a word, as in snake_case, is just a character)
      const canOpen = ch === "*" ? left : left && (!right || isPunct(before));
      const canClose = ch === "*" ? right : right && (!left || isPunct(after));
      const delim: Delim = { t: "delim", ch, n: e - i };
      flush();
      if (canClose) closeEmphasis(out, openers, delim);
      if (delim.n > 0) {
        if (canOpen) {
          openers[ch].push({ delim, at: out.length });
          out.push(delim);
        } else out.push(ch.repeat(delim.n));
      }
      i = e;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  return out.map(asText);
}

// Matches `closer` with the nearest opener of the same character, as often as
// both have characters left. What's between them (now the end of `out`)
// becomes the emphasis; openers of the other character inside it can't close
// any more.
function closeEmphasis(out: Item[], openers: Record<"*" | "_", { delim: Delim; at: number }[]>, closer: Delim) {
  const mine = openers[closer.ch];
  const other = openers[closer.ch === "*" ? "_" : "*"];
  while (closer.n > 0 && mine.length > 0) {
    const opener = mine[mine.length - 1];
    const use = opener.delim.n >= 2 && closer.n >= 2 ? 2 : 1;
    const inner = out.splice(opener.at + 1);
    while (other.length > 0 && other[other.length - 1].at > opener.at) other.pop();
    opener.delim.n -= use;
    closer.n -= use;
    if (opener.delim.n === 0) {
      out.pop();
      mine.pop();
    }
    const depth = depthOf(inner) + 1;
    const marks = closer.ch.repeat(use);
    if (depth > MAX_EMPHASIS_DEPTH) {
      // too deep to nest further: the marks show as text
      out.push(marks, ...inner, marks);
      continue;
    }
    const node: Inline = { t: use === 2 ? "strong" : "em", c: inner.map(asText) };
    emphasisDepth.set(node, depth);
    out.push(node);
  }
}

//// rendering

function renderInline(items: Inline[]): ReactNode[] {
  return items.map((it, k) => {
    if (typeof it === "string") return it;
    switch (it.t) {
      case "br":
        return <br key={k} />;
      case "code":
        return (
          <code key={k} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">
            {it.v}
          </code>
        );
      case "em":
        return <em key={k}>{renderInline(it.c)}</em>;
      case "strong":
        return (
          <strong key={k} className="font-semibold text-slate-900">
            {renderInline(it.c)}
          </strong>
        );
      case "a":
        return (
          <a
            key={k}
            href={it.href}
            title={it.title}
            rel={LINK_REL}
            target={it.external ? "_blank" : undefined}
            className="font-medium text-accent-600 underline decoration-accent-600/40 underline-offset-2 hover:decoration-accent-600"
          >
            {renderInline(it.c)}
          </a>
        );
    }
  });
}

function renderBlocks(blocks: Block[]): ReactNode[] {
  return blocks.map((b, k) => {
    switch (b.t) {
      case "p":
        return <p key={k}>{renderInline(b.c)}</p>;
      case "h": {
        const Tag = `h${b.level}` as const;
        const size = b.level === 2 ? "text-lg" : b.level === 3 ? "text-base" : "text-[15px]";
        return (
          <Tag key={k} className={cx(size, "font-semibold tracking-tight text-slate-900")}>
            {renderInline(b.c)}
          </Tag>
        );
      }
      case "code":
        return (
          <pre key={k} className="overflow-x-auto rounded-xl bg-slate-100 px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-800">
            <code>{b.v}</code>
          </pre>
        );
      case "list": {
        const items = b.items.map((item, j) => (
          // an item of one paragraph shows inline (a tight list)
          <li key={j} className="pl-1">
            {item.length === 1 && item[0].t === "p" ? renderInline(item[0].c) : <div className="space-y-2">{renderBlocks(item)}</div>}
          </li>
        ));
        return b.ordered ? (
          <ol key={k} start={b.start === 1 ? undefined : b.start} className="list-decimal space-y-1 pl-6">
            {items}
          </ol>
        ) : (
          <ul key={k} className="list-disc space-y-1 pl-6">
            {items}
          </ul>
        );
      }
    }
  });
}

export function Markdown(props: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(props.source), [props.source]);
  return (
    <div className={cx("space-y-3 text-[15px] leading-relaxed break-words text-slate-700", props.className)}>
      {renderBlocks(blocks)}
    </div>
  );
}
