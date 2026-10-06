const PAGE_SIZE = 20;

let renderer;
let nextCursor = null;
let selectedAccountId = ""; // "" = all accounts

function accountQuery() {
  return selectedAccountId ? `&accountId=${encodeURIComponent(selectedAccountId)}` : "";
}

async function loadHistoryPage() {
  requireAuth();
  renderNavbar("history");
  try {
    const { accounts } = await apiRequest("/api/accounts");
    renderAccountFilter(accounts);
  } catch (err) {
    document.getElementById("history-error").textContent = err.message;
    return;
  }
  await reloadHistory();

  startRealtime({
    onTransaction: scheduleHistoryReload,
    onResync: scheduleHistoryReload,
  });
}

// Live updates: several events can arrive together, so wait a moment and reload once
let historyTimer = null;
let historyReloading = false;
let historyReloadQueued = false;

function scheduleHistoryReload() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(runScheduledHistoryReload, 250);
}

async function runScheduledHistoryReload() {
  if (historyReloading) {
    historyReloadQueued = true;
    return;
  }
  historyReloading = true;
  try {
    await reloadHistory({ quiet: true });
  } finally {
    historyReloading = false;
    if (historyReloadQueued) {
      historyReloadQueued = false;
      scheduleHistoryReload();
    }
  }
}

function renderAccountFilter(accounts) {
  const container = document.getElementById("account-filter");
  container.textContent = "";
  // A filter only makes sense with more than one account
  if (accounts.length < 2) {
    container.hidden = true;
    return;
  }
  const options = [{ id: "", label: "All accounts" }, ...accounts.map((a) => ({ id: a._id, label: `Account ${shortId(a._id)}` }))];
  for (const opt of options) {
    const chip = el("button", "chip", opt.label);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(opt.id === selectedAccountId));
    chip.addEventListener("click", async () => {
      selectedAccountId = opt.id;
      container.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      await reloadHistory();
    });
    container.append(chip);
  }
}

// quiet: used by live updates - keep the current list on screen until the new data has
// arrived, then swap it in, instead of flashing "Loading..."
async function reloadHistory({ quiet = false } = {}) {
  const listEl = document.getElementById("history-list");
  const errorEl = document.getElementById("history-error");
  if (!quiet) {
    errorEl.textContent = "";
    listEl.textContent = "";
    document.getElementById("history-empty").hidden = true;
    document.getElementById("load-more").hidden = true;
    listEl.append(el("p", "tx-empty", "Loading your transactions..."));
  }

  try {
    // Month totals are computed server-side in the viewer's timezone
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [{ months }, firstPage] = await Promise.all([
      apiRequest(`/api/transactions/summary?tz=${tz}${accountQuery()}`),
      apiRequest(`/api/transactions?limit=${PAGE_SIZE}${accountQuery()}`),
    ]);
    const summaries = Object.fromEntries(months.map((m) => [m.month, m]));

    errorEl.textContent = "";
    renderer = createTxListRenderer(listEl, { summaries });
    renderer.reset();
    showPage(firstPage, true);
  } catch (err) {
    // A failed background refresh keeps the list that is already on screen
    if (quiet) return;
    listEl.textContent = "";
    errorEl.textContent = err.message;
  }
}

function showPage(data, isFirstPage) {
  renderer.append(data.transactions);
  nextCursor = data.nextCursor;
  document.getElementById("history-empty").hidden = !(isFirstPage && data.transactions.length === 0);
  document.getElementById("load-more").hidden = !nextCursor;
}

async function loadNextPage() {
  const loadMoreBtn = document.getElementById("load-more");
  const errorEl = document.getElementById("history-error");
  loadMoreBtn.disabled = true;

  try {
    const cursor = nextCursor ? `&before=${encodeURIComponent(nextCursor)}` : "";
    const data = await apiRequest(`/api/transactions?limit=${PAGE_SIZE}${cursor}${accountQuery()}`);
    showPage(data, !cursor);
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    loadMoreBtn.disabled = false;
  }
}
