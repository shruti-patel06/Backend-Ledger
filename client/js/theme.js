// Loaded in <head> (not deferred) so the saved theme is applied before the first paint -
// otherwise dark-mode users would see a white flash on every page load.
// No saved choice = follow the operating system's light/dark setting.
const THEME_KEY = "ledger_theme";

(function applySavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
    }
  } catch {
    // Storage blocked (private mode etc.) - just follow the OS setting
  }
})();

function currentTheme() {
  return (
    document.documentElement.dataset.theme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Not persisted, but still applied for this page
  }
  document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
}
