function requireAuth() {
  if (!getToken()) {
    window.location.href = "login.html";
  }
}

async function loadDashboard() {
  requireAuth();
  const user = getUser();
  if (user) {
    document.getElementById("welcome").textContent = `Welcome, ${user.name}`;
  }
  await refreshAccounts();
}

async function refreshAccounts() {
  const accountsListEl = document.getElementById("accounts-list");
  const fromAccountSelect = document.getElementById("fromAccount");
  accountsListEl.innerHTML = "<li>Loading...</li>";

  try {
    const { accounts } = await apiRequest("/api/accounts");

    const balances = await Promise.all(
      accounts.map((acc) =>
        apiRequest(`/api/accounts/balance/${acc._id}`).catch(() => ({ balance: "?" })),
      ),
    );

    accountsListEl.innerHTML = "";
    fromAccountSelect.innerHTML = "";

    if (accounts.length === 0) {
      accountsListEl.innerHTML = "<li>No accounts yet. Create one above.</li>";
    }

    accounts.forEach((acc, i) => {
      const li = document.createElement("li");
      li.className = "account-card";
      li.innerHTML = `
        <span class="account-id">${acc._id}</span>
        <span class="account-status">${acc.status}</span>
        <span class="account-balance">${balances[i].balance} ${acc.currency}</span>
      `;
      accountsListEl.appendChild(li);

      const option = document.createElement("option");
      option.value = acc._id;
      option.textContent = `${acc._id} — ${balances[i].balance} ${acc.currency}`;
      fromAccountSelect.appendChild(option);
    });
  } catch (err) {
    accountsListEl.innerHTML = `<li class="error">${err.message}</li>`;
  }
}

async function handleCreateAccount() {
  const msgEl = document.getElementById("create-account-msg");
  msgEl.textContent = "";
  msgEl.className = "msg";
  try {
    await apiRequest("/api/accounts", { method: "POST" });
    msgEl.textContent = "Account created.";
    msgEl.className = "msg success";
    await refreshAccounts();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = "msg error";
  }
}

async function handleTransfer(event) {
  event.preventDefault();
  const fromAccount = document.getElementById("fromAccount").value;
  const toAccount = document.getElementById("toAccount").value.trim();
  const amount = Number(document.getElementById("amount").value);
  const msgEl = document.getElementById("transfer-msg");
  msgEl.textContent = "";
  msgEl.className = "msg";

  try {
    const idempotencyKey = crypto.randomUUID();
    const data = await apiRequest("/api/transactions", {
      method: "POST",
      body: { fromAccount, toAccount, amount, idempotencyKey },
    });
    msgEl.textContent = data.message || "Transfer completed.";
    msgEl.className = "msg success";
    document.getElementById("transfer-form").reset();
    await refreshAccounts();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = "msg error";
  }
}

async function handleSeedFunds(event) {
  event.preventDefault();
  const toAccount = document.getElementById("seedToAccount").value.trim();
  const amount = Number(document.getElementById("seedAmount").value);
  const msgEl = document.getElementById("seed-msg");
  msgEl.textContent = "";
  msgEl.className = "msg";

  try {
    const idempotencyKey = crypto.randomUUID();
    const data = await apiRequest("/api/transactions/system/initial-funds", {
      method: "POST",
      body: { toAccount, amount, idempotencyKey },
    });
    msgEl.textContent = data.message || "Funds seeded.";
    msgEl.className = "msg success";
    document.getElementById("seed-form").reset();
    await refreshAccounts();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = "msg error";
  }
}

function handleLogout() {
  apiRequest("/api/auth/logout", { method: "POST" })
    .catch(() => {})
    .finally(() => {
      clearSession();
      window.location.href = "login.html";
    });
}
