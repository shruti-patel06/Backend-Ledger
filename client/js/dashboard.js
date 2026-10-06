const ACCOUNT_ID_PATTERN = /^[a-f\d]{24}$/i;

let accounts = [];
let balances = {}; // accountId -> number, or null if it couldn't be loaded

async function loadDashboard() {
  requireAuth();
  renderNavbar("home");

  const user = getUser() || {};
  const firstName = (user.name || "").split(" ")[0];
  document.getElementById("greeting").textContent = firstName ? `Hi, ${firstName}` : "Home";

  // UI convenience only - the API itself rejects non-system users on the issue-funds route
  if (user.system) {
    document.getElementById("seed-card").hidden = false;
    document.getElementById("intro").textContent =
      "You are signed in as the Treasury. Issue funds to a user's account ID so they have money to send.";
  }

  document.getElementById("create-account-btn").addEventListener("click", handleCreateAccount);
  document.getElementById("transfer-form").addEventListener("submit", handleTransfer);
  document.getElementById("seed-form").addEventListener("submit", handleSeedFunds);
  document.getElementById("fromAccount").addEventListener("change", updateAvailableHint);

  await refreshAll();
}

function refreshAll() {
  return Promise.all([refreshAccounts(), refreshRecent()]);
}

function displayBalance(balance, currency) {
  return typeof balance === "number" ? formatMoney(balance, currency) : "—";
}

async function refreshAccounts() {
  const listEl = document.getElementById("accounts-list");
  try {
    ({ accounts } = await apiRequest("/api/accounts"));
    const results = await Promise.all(
      accounts.map((acc) => apiRequest(`/api/accounts/balance/${acc._id}`).catch(() => ({ balance: null }))),
    );
    balances = Object.fromEntries(accounts.map((acc, i) => [acc._id, results[i].balance]));
  } catch (err) {
    listEl.textContent = "";
    listEl.append(el("li", "msg error", err.message));
    return;
  }

  renderAccounts();
  renderFromOptions();
}

function renderAccounts() {
  const listEl = document.getElementById("accounts-list");
  listEl.textContent = "";

  if (accounts.length === 0) {
    listEl.append(el("li", "empty", 'No accounts yet. Click "+ New account" to open one.'));
    return;
  }

  for (const acc of accounts) {
    const card = el("li", "account-card");

    const info = el("div");
    info.append(el("div", "account-id", acc._id));
    const meta = el("div", "account-meta");
    meta.append(el("span", "account-status", acc.status));
    const copy = el("button", "link-btn", "Copy ID");
    copy.type = "button";
    copy.addEventListener("click", () => copyText(acc._id, copy));
    meta.append(copy);
    info.append(meta);

    card.append(info, el("div", "account-balance", displayBalance(balances[acc._id], acc.currency)));
    listEl.append(card);
  }
}

function renderFromOptions() {
  const select = document.getElementById("fromAccount");
  const previous = select.value;
  select.textContent = "";
  for (const acc of accounts) {
    const option = document.createElement("option");
    option.value = acc._id;
    option.textContent = `${shortId(acc._id)} · ${displayBalance(balances[acc._id], acc.currency)}`;
    select.append(option);
  }
  if (accounts.some((a) => a._id === previous)) select.value = previous;

  const hasAccounts = accounts.length > 0;
  document.querySelectorAll("#transfer-form input, #transfer-form select, #transfer-btn").forEach((node) => {
    node.disabled = !hasAccounts;
  });
  updateAvailableHint();
}

// What can actually be sent from an account: never negative (the Treasury's balance is
// negative by design, but it has nothing "available"). null if the balance couldn't be loaded.
function availableToSend(accountId) {
  const balance = balances[accountId];
  return typeof balance === "number" ? Math.max(balance, 0) : null;
}

function updateAvailableHint() {
  const hint = document.getElementById("available-hint");
  const id = document.getElementById("fromAccount").value;
  if (!id) {
    hint.textContent = "Open an account first, then you can send money.";
    return;
  }
  const available = availableToSend(id);
  hint.textContent = available === null ? "Available balance couldn't be loaded." : `Available: ${formatMoney(available)}`;
}

async function handleCreateAccount(event) {
  const button = event.currentTarget;
  setLoading(button, true, "Opening...");
  try {
    await apiRequest("/api/accounts", { method: "POST" });
    await refreshAll();
  } catch (err) {
    document.getElementById("accounts-list").prepend(el("li", "msg error", err.message));
  } finally {
    setLoading(button, false);
  }
}

async function refreshRecent() {
  const listEl = document.getElementById("recent-list");
  const emptyEl = document.getElementById("recent-empty");
  try {
    const { transactions } = await apiRequest("/api/transactions?limit=5");
    const renderer = createTxListRenderer(listEl, { grouped: false });
    renderer.reset();
    renderer.append(transactions);
    emptyEl.hidden = transactions.length > 0;
  } catch (err) {
    listEl.textContent = "";
    listEl.append(el("p", "msg error", err.message));
  }
}

// ---- Forms ----

function setMessage(id, text, type) {
  const msgEl = document.getElementById(id);
  msgEl.textContent = text;
  msgEl.className = `msg ${type || ""}`;
}

function checkAccountId(input, notSameAs) {
  const value = input.value.trim();
  let problem = null;
  if (!value) problem = "Enter the account ID.";
  else if (!ACCOUNT_ID_PATTERN.test(value)) problem = "That doesn't look like an account ID. It should be 24 letters and numbers.";
  else if (notSameAs && value === notSameAs) problem = "Choose a different account - you can't send to the account the money comes from.";
  input.setAttribute("aria-invalid", problem ? "true" : "false");
  return problem;
}

function checkAmount(input, available) {
  const amount = Number(input.value);
  let problem = null;
  if (!input.value || !(amount > 0)) problem = "Enter an amount greater than zero.";
  else if (typeof available === "number" && amount > available) problem = `Not enough balance. You have ${formatMoney(available)} available in this account.`;
  input.setAttribute("aria-invalid", problem ? "true" : "false");
  return problem;
}

async function handleTransfer(event) {
  event.preventDefault();
  const fromAccount = document.getElementById("fromAccount").value;
  const toInput = document.getElementById("toAccount");
  const amountInput = document.getElementById("amount");
  const button = document.getElementById("transfer-btn");
  setMessage("transfer-msg", "");

  const problem = checkAccountId(toInput, fromAccount) || checkAmount(amountInput, availableToSend(fromAccount));
  if (problem) {
    setMessage("transfer-msg", problem, "error");
    return;
  }

  const toAccount = toInput.value.trim();
  const amount = Number(amountInput.value);
  setLoading(button, true, "Sending...");
  try {
    await apiRequest("/api/transactions", {
      method: "POST",
      // A fresh key per submit; the server uses it to ignore accidental duplicates
      body: { fromAccount, toAccount, amount, idempotencyKey: crypto.randomUUID() },
    });
    document.getElementById("transfer-form").reset();
    setMessage("transfer-msg", `Sent ${formatMoney(amount)} to ${shortId(toAccount)}.`, "success");
    await refreshAll();
  } catch (err) {
    setMessage("transfer-msg", err.message, "error");
  } finally {
    setLoading(button, false);
  }
}

async function handleSeedFunds(event) {
  event.preventDefault();
  const toInput = document.getElementById("seedToAccount");
  const amountInput = document.getElementById("seedAmount");
  const button = document.getElementById("seed-btn");
  setMessage("seed-msg", "");

  const problem = checkAccountId(toInput) || checkAmount(amountInput);
  if (problem) {
    setMessage("seed-msg", problem, "error");
    return;
  }

  const toAccount = toInput.value.trim();
  const amount = Number(amountInput.value);
  setLoading(button, true, "Issuing...");
  try {
    await apiRequest("/api/transactions/system/initial-funds", {
      method: "POST",
      body: { toAccount, amount, idempotencyKey: crypto.randomUUID() },
    });
    document.getElementById("seed-form").reset();
    setMessage("seed-msg", `Issued ${formatMoney(amount)} to ${shortId(toAccount)}.`, "success");
    await refreshAll();
  } catch (err) {
    setMessage("seed-msg", err.message, "error");
  } finally {
    setLoading(button, false);
  }
}
