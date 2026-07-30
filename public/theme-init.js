(function () {
  try {
    var raw = localStorage.getItem("opendraft.prefs");
    var prefs = raw ? JSON.parse(raw).state : null;
    var fallbackTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    var theme =
      prefs && (prefs.theme === "light" || prefs.theme === "dark") ? prefs.theme : fallbackTheme;
    var density =
      prefs && (prefs.density === "comfortable" || prefs.density === "compact")
        ? prefs.density
        : "comfortable";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-density", density);
  } catch (_) {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.setAttribute("data-density", "comfortable");
  }
})();
