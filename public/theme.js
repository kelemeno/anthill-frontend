// Light or dark, when this browser chose one in the account menu (System, the
// default, needs nothing: the CSS follows prefers-color-scheme). Runs before
// the page paints, so it never flashes the other scheme. A file, not an inline
// script: the Content Security Policy allows only this site's own scripts.
// src/theme.ts does the same when the choice changes.
(function () {
  try {
    var theme = localStorage.getItem("anthill.theme");
    if (theme !== "light" && theme !== "dark") return;
    document.documentElement.setAttribute("data-theme", theme);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", theme === "dark" ? "#0f172b" : "#ffffff");
  } catch (e) {}
})();
