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

async function reloadHistory() {
  const listEl = document.getElementById("history-list");
  const errorEl = document.getElementById("history-error");
  errorEl.textContent = "";
  listEl.textContent = "";
  document.getElementById("history-empty").hidden = true;
  document.getElementById("load-more").hidden = true;
  listEl.append(el("p", "tx-empty", "Loading your transactions..."));

  try {
    // Month totals are computed server-side in the viewer's timezone
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const { months } = await apiRequest(`/api/transactions/summary?tz=${tz}${accountQuery()}`);
    const summaries = Object.fromEntries(months.map((m) => [m.month, m]));

    renderer = createTxListRenderer(listEl, { summaries });
    renderer.reset();
    nextCursor = null;
    await loadNextPage();
  } catch (err) {
    listEl.textContent = "";
    errorEl.textContent = err.message;
  }
}

async function loadNextPage() {
  const loadMoreBtn = document.getElementById("load-more");
  const errorEl = document.getElementById("history-error");
  loadMoreBtn.disabled = true;

  try {
    const cursor = nextCursor ? `&before=${encodeURIComponent(nextCursor)}` : "";
    const data = await apiRequest(`/api/transactions?limit=${PAGE_SIZE}${cursor}${accountQuery()}`);
    renderer.append(data.transactions);
    nextCursor = data.nextCursor;

    const isFirstPage = !cursor;
    document.getElementById("history-empty").hidden = !(isFirstPage && data.transactions.length === 0);
    loadMoreBtn.hidden = !nextCursor;
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    loadMoreBtn.disabled = false;
  }
}
