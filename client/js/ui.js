// Small shared helpers: navbar, theme toggle, logout, button states.

function requireAuth() {
  if (!getToken()) {
    window.location.replace("login.html");
  }
}

function handleLogout() {
  // Close the live-update stream first so it doesn't try to reconnect with a revoked token
  if (typeof stopRealtime === "function") stopRealtime();
  apiRequest("/api/auth/logout", { method: "POST" })
    .catch(() => {})
    .finally(() => {
      clearSession();
      window.location.href = "login.html?reason=loggedout";
    });
}

// Small icon button that flips between light and dark mode.
// Shows a sun while in dark mode (click for light) and a moon while in light mode.
const THEME_ICONS = {
  sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};

function themeToggleButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn theme-toggle";
  const sync = () => {
    const dark = currentTheme() === "dark";
    button.innerHTML = THEME_ICONS[dark ? "sun" : "moon"];
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  };
  button.addEventListener("click", () => {
    toggleTheme();
    sync();
  });
  sync();
  return button;
}

// Disables a button and swaps its label while a request is in flight
function setLoading(button, loading, loadingText) {
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

// Small message that appears at the bottom of the screen and fades after a few seconds.
// Announced to screen readers (role="status"), never steals focus.
function showToast(text, type) {
  let container = document.getElementById("toasts");
  if (!container) {
    container = el("div", "toasts");
    container.id = "toasts";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.append(container);
  }
  const toast = el("div", `toast ${type || ""}`, text);
  container.append(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

function renderNavbar(active) {
  const user = getUser();

  const header = document.createElement("header");
  header.className = "navbar";
  const inner = document.createElement("div");
  inner.className = "navbar-inner";

  const brand = document.createElement("a");
  brand.href = "dashboard.html";
  brand.className = "brand";
  brand.textContent = "Backend Ledger";

  const links = document.createElement("nav");
  links.className = "nav-links";
  for (const [id, label, href] of [
    ["home", "Home", "dashboard.html"],
    ["history", "History", "history.html"],
  ]) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (id === active) a.setAttribute("aria-current", "page");
    links.append(a);
  }

  const right = document.createElement("div");
  right.className = "nav-right";

  // Connection state of the live-update stream; stays hidden until startRealtime() sets it
  const live = document.createElement("span");
  live.id = "live-status";
  live.className = "live-badge";
  live.hidden = true;
  live.dataset.state = "connecting";
  const liveDot = document.createElement("span");
  liveDot.className = "live-dot";
  liveDot.setAttribute("aria-hidden", "true");
  const liveText = document.createElement("span");
  liveText.className = "live-text";
  live.append(liveDot, liveText);
  right.append(live);

  if (user) {
    const name = document.createElement("span");
    name.textContent = user.system ? `${user.name} (Treasury)` : user.name;
    right.append(name);
  }
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "secondary small";
  logout.textContent = "Log out";
  logout.addEventListener("click", handleLogout);
  right.append(logout);
  // Last, so it sits in the top-right corner
  right.append(themeToggleButton());

  inner.append(brand, links, right);
  header.append(inner);
  document.body.prepend(header);

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  const privacy = document.createElement("a");
  privacy.href = "privacy.html";
  privacy.textContent = "Privacy Policy";
  footer.append(privacy);
  document.body.append(footer);
}
