// The About renderer, against hostile input: no HTML ever becomes markup,
// links go only where they may (and carry rel), entities stay as written,
// emphasis nests as Markdown says, and long or pathological input renders
// quickly without exhausting the stack.
// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LINK_REL, Markdown, parseInline, parseMarkdown, safeHref } from "./markdown";

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} />);
const dom = (source: string) => {
  const div = document.createElement("div");
  div.innerHTML = html(source);
  return div;
};
const links = (source: string) => [...dom(source).querySelectorAll("a")];
// every element the renderer may make
const ALLOWED = new Set(["DIV", "P", "H2", "H3", "H4", "UL", "OL", "LI", "EM", "STRONG", "CODE", "PRE", "A", "BR"]);
const tags = (source: string) => [...dom(source).querySelectorAll("*")].map((el) => el.tagName);

describe("no HTML", () => {
  const hostile = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<iframe src='https://evil.example'></iframe>",
    "<a href=\"javascript:alert(1)\">x</a>",
    "<svg onload=alert(1)>",
    "<style>body{display:none}</style>",
    "**<b>bold</b>**",
    "`<script>` and ```\n<script>alert(1)</script>\n```",
    "- <script>alert(1)</script>\n- two",
    "# <script>alert(1)</script>",
    "<!-- comment -->",
    "<scr<script>ipt>alert(1)</script>",
  ];
  it.each(hostile)("shows %s as text", (source) => {
    for (const tag of tags(source)) expect(ALLOWED.has(tag), tag).toBe(true);
    expect(html(source)).not.toMatch(/<(script|img|iframe|svg|style|b)\b/i);
    for (const el of dom(source).querySelectorAll("*")) {
      expect(el.getAttributeNames().filter((a) => a.startsWith("on"))).toEqual([]);
    }
  });

  it("keeps the text of a tag, escaped", () => {
    expect(dom("<script>alert(1)</script>").textContent).toBe("<script>alert(1)</script>");
    expect(html("<script>")).toContain("&lt;script&gt;");
  });
});

describe("links", () => {
  it("links https, http, mailto and paths on this site, with rel", () => {
    const [web, plain, mail, path] = links(
      "[a](https://example.org/x?y=1) [b](http://example.org) [c](mailto:hi@example.org) [d](/c/demo/explore)",
    );
    expect(web.getAttribute("href")).toBe("https://example.org/x?y=1");
    expect(plain.getAttribute("href")).toBe("http://example.org/");
    expect(mail.getAttribute("href")).toBe("mailto:hi@example.org");
    expect(path.getAttribute("href")).toBe("/c/demo/explore");
    for (const a of [web, plain, mail, path]) expect(a.getAttribute("rel")).toBe(LINK_REL);
    expect(LINK_REL).toBe("noopener noreferrer nofollow ugc");
    // web links open in a new tab; mail and this site's pages in place
    expect([web, plain, mail, path].map((a) => a.getAttribute("target"))).toEqual(["_blank", "_blank", null, null]);
  });

  const refused = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "javascript&#58;alert(1)",
    "java&#x09;script:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/png;base64,AAAA",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "http://",
    "ftp://example.org",
    "#top",
    "relative/path",
    "&#x2F;&#x2F;evil.example",
  ];
  it.each(refused)("doesn't link to %s", (url) => {
    expect(safeHref(url)).toBeUndefined();
    const source = `[click](${url})`;
    expect(links(source)).toEqual([]);
    // it shows as written
    expect(dom(source).textContent).toContain("click");
  });

  it("refuses addresses with control characters or spaces inside", () => {
    expect(safeHref("java\u0000script:alert(1)")).toBeUndefined();
    expect(safeHref("https://exa mple.org")).toBeUndefined();
    expect(safeHref("https://example.org/\u0007")).toBeUndefined();
    expect(links("[x](java\tscript:alert(1))")).toEqual([]);
  });

  it("keeps quotes in addresses and titles inside the attribute", () => {
    const [a] = links('[x](https://example.org/a"onmouseover="alert(1) "say "hi"")');
    // the title stops at its closing quote; the rest is no link at all
    expect(a).toBeUndefined();
    const [b] = links('[x](https://example.org/a"b\'c "it\'s")');
    expect(b.getAttribute("href")).toBe("https://example.org/a%22b'c");
    expect(b.getAttribute("title")).toBe("it's");
    expect(b.getAttributeNames().sort()).toEqual(["class", "href", "rel", "target", "title"]);
    expect(html("[x](https://example.org/?q=\"><script>)")).not.toContain("<script");
  });

  it("parses titles, parentheses and autolinks", () => {
    const [titled] = links('[docs](https://example.org "The docs")');
    expect(titled.getAttribute("title")).toBe("The docs");
    const [wiki] = links("[Ant](https://en.wikipedia.org/wiki/Ant_(disambiguation))");
    expect(wiki.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Ant_(disambiguation)");
    const [auto] = links("see <https://example.org/a>");
    expect(auto.getAttribute("href")).toBe("https://example.org/a");
    expect(links("<javascript:alert(1)>")).toEqual([]);
  });

  it("puts no links inside links, and lets labels have emphasis", () => {
    const a = links("[**bold** [inner](https://b.example)](https://a.example)");
    expect(a.every((l) => !l.querySelector("a"))).toBe(true);
    const [one] = links("[*hi*](https://a.example)");
    expect(one.innerHTML).toBe("<em>hi</em>");
  });

  it("shows images as text, loading nothing", () => {
    const d = dom("![tracker](https://evil.example/pixel.png)");
    expect(d.querySelector("img")).toBeNull();
    expect(d.querySelector("a")).toBeNull();
    expect(d.textContent).toBe("![tracker](https://evil.example/pixel.png)");
  });
});

describe("text", () => {
  it("leaves HTML entities as written", () => {
    expect(dom("Tom &amp; Jerry &lt;b&gt; &#60;script&#62; &#x3C;").textContent).toBe(
      "Tom &amp; Jerry &lt;b&gt; &#60;script&#62; &#x3C;",
    );
    expect(dom("&lt;script&gt;alert(1)&lt;/script&gt;").querySelector("script")).toBeNull();
  });

  it("honours backslash escapes", () => {
    expect(dom("\\*not em\\* \\[not](a link) \\`x\\`").textContent).toBe("*not em* [not](a link) `x`");
    expect(dom("\\*not em\\*").querySelector("em")).toBeNull();
  });

  it("keeps a line break within a paragraph, and splits paragraphs on blank lines", () => {
    const d = dom("one\ntwo\n\nthree");
    expect([...d.querySelectorAll("p")].map((p) => p.innerHTML)).toEqual(["one<br>two", "three"]);
  });

  it("shows unsupported syntax as written", () => {
    expect(dom("> a quote").textContent).toBe("> a quote");
    expect(dom("| a | b |\n|---|---|").textContent).toBe("| a | b |\n|---|---|".replace("\n", ""));
    expect(dom("---").textContent).toBe("---");
    expect(dom("* * *").querySelector("ul")).toBeNull();
  });
});

describe("emphasis", () => {
  const inner = (source: string) => dom(source).querySelector("p")!.innerHTML;
  it.each([
    ["*a*", "<em>a</em>"],
    ["_a_", "<em>a</em>"],
    ["**a**", '<strong class="font-semibold text-slate-900">a</strong>'],
    ["***a***", '<em><strong class="font-semibold text-slate-900">a</strong></em>'],
    ["*a **b** c*", '<em>a <strong class="font-semibold text-slate-900">b</strong> c</em>'],
    ["**a *b* c**", '<strong class="font-semibold text-slate-900">a <em>b</em> c</strong>'],
    ["*a _b_ c*", "<em>a <em>b</em> c</em>"],
    ["*a", "*a"],
    ["a*", "a*"],
    ["**a*", "*<em>a</em>"],
    ["*a**", "<em>a</em>*"],
    ["x * a *", "x * a *"],
    ["snake_case_name", "snake_case_name"],
    ["2 * 3 * 4", "2 * 3 * 4"],
    ["*a _b* c_", "<em>a _b</em> c_"],
    ["`*not em*`", '<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">*not em*</code>'],
  ])("%s", (source, expected) => {
    expect(inner(source)).toBe(expected);
  });

  it("caps how deep emphasis nests", () => {
    const source = `${"*a ".repeat(400)}x${" a*".repeat(400)}`;
    const d = dom(source);
    let depth = 0;
    for (let el: Element | null = d.querySelector("em"); el; el = el.querySelector("em")) depth++;
    expect(depth).toBeLessThanOrEqual(12);
    expect(d.textContent?.replace(/[*\s]/g, "")).toBe(`${"a".repeat(400)}x${"a".repeat(400)}`);
  });
});

describe("code", () => {
  it("renders inline code and fenced blocks as text", () => {
    const d = dom("Use `npm test`.\n\n```ts\nconst a = 1 < 2 && \"<b>\";\n```");
    expect(d.querySelector("p code")?.textContent).toBe("npm test");
    expect(d.querySelector("pre code")?.textContent).toBe('const a = 1 < 2 && "<b>";');
  });

  it("takes the longest matching run of backticks, and a fence runs to the end when unclosed", () => {
    expect(dom("``a ` b``").querySelector("code")?.textContent).toBe("a ` b");
    expect(dom("`unclosed").textContent).toBe("`unclosed");
    expect(dom("~~~\n# not a heading\n- nor a list").querySelector("pre")?.textContent).toBe("# not a heading\n- nor a list");
  });
});

describe("blocks", () => {
  it("makes headings one level below the page's", () => {
    expect(tags("# One\n## Two\n### Three\n#### Four")).toEqual(["DIV", "H2", "H3", "H4", "H4"]);
    expect(dom("#hashtag").querySelector("h2")).toBeNull();
  });

  it("makes lists, ordered with their start, nested by indenting", () => {
    const d = dom("- a\n- b\n  - c\n  - d\n- e\n\n3. three\n4. four");
    const ul = d.querySelector("ul")!;
    expect([...ul.children].map((li) => li.textContent)).toEqual(["a", "bcd", "e"]);
    expect(ul.querySelector("ul")?.textContent).toBe("cd");
    expect(d.querySelector("ol")?.getAttribute("start")).toBe("3");
  });

  it("keeps a year at the start of a line in its sentence", () => {
    expect(dom("We started in\n1999. Then we grew.").querySelector("ol")).toBeNull();
  });

  it("caps how deep lists nest", () => {
    const source = Array.from({ length: 40 }, (_, i) => `${"  ".repeat(i)}- level ${i}`).join("\n");
    const d = dom(source);
    expect(d.querySelectorAll("ul").length).toBeLessThanOrEqual(6);
    expect(d.textContent).toContain("level 39");
  });
});

describe("long input", () => {
  const quick = (source: string) => {
    const start = performance.now();
    parseMarkdown(source);
    html(source);
    return performance.now() - start;
  };
  it.each([
    ["plain text", "word ".repeat(40_000)],
    ["stars", "*".repeat(100_000)],
    ["alternating delimiters", "*_".repeat(50_000)],
    ["openers", "*a ".repeat(30_000)],
    ["brackets", "[".repeat(100_000)],
    ["unfinished links", "[a](".repeat(25_000)],
    ["unfinished titles", '[a](b "'.repeat(15_000)],
    ["backticks", "` ``".repeat(25_000)],
    ["angle brackets", "<https://a".repeat(10_000)],
    ["nested lists", Array.from({ length: 5_000 }, (_, i) => `${"  ".repeat(i % 50)}- x`).join("\n")],
    ["lines", "a\n".repeat(50_000)],
  ])("renders %s quickly", (_name, source) => {
    expect(quick(source)).toBeLessThan(2_000);
  });

  it("keeps all of a long text", () => {
    const source = "x".repeat(10_000);
    expect(dom(source).textContent).toBe(source);
  });
});

describe("parseInline", () => {
  it("turns line breaks into breaks", () => {
    expect(parseInline("a\nb")).toEqual(["a", { t: "br" }, "b"]);
  });
});
