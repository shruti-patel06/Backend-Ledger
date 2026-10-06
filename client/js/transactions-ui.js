// Shared rendering for transaction lists (dashboard "Recent" card + history page).
// Names come from other users, so every user-supplied string goes through
// textContent - never innerHTML - to rule out XSS.

const AVATAR_COLORS = ["#2f6fed", "#1a7f37", "#d4570f", "#8250df", "#cf222e", "#0a7ea4", "#bf3989", "#57606a"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ₹1,200 for whole amounts, ₹450.50 otherwise
function formatMoney(amount, currency = "INR") {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function shortId(id) {
  return id ? `•••• ${String(id).slice(-4)}` : "—";
}

// "YYYY-MM" in the viewer's local time - same format as the summary API returns
function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function txTitle(tx) {
  if (tx.direction === "SELF") return "Self transfer";
  // Seen from a single account: the other side is one of the user's own accounts
  if (tx.counterparty.isOwnAccount) {
    const other = shortId(tx.counterparty.accountId);
    return tx.direction === "DEBIT" ? `Sent to your account ${other}` : `Received from your account ${other}`;
  }
  if (tx.direction === "DEBIT") return `Paid to ${tx.counterparty.name}`;
  return `Received from ${tx.counterparty.name}`;
}

function avatar(tx) {
  const node = el("div", "tx-avatar");
  const name = tx.counterparty.name;
  if (tx.direction === "SELF" || tx.counterparty.isOwnAccount) {
    node.textContent = "⇄";
    node.style.background = "#6b7280";
    return node;
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  node.textContent = initials || "?";
  // Same name -> same color every time (FNV-1a hash spreads similar names apart)
  let hash = 2166136261;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  node.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return node;
}

function renderTxRow(tx) {
  const row = el("li", "tx-row");
  row.tabIndex = 0;
  row.setAttribute("role", "button");

  const main = el("div", "tx-main");
  main.append(
    el("div", "tx-title", txTitle(tx)),
    el(
      "div",
      "tx-sub",
      new Date(tx.createdAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    ),
  );

  const side = el("div", "tx-side");
  const sign = tx.direction === "CREDIT" ? "+" : tx.direction === "DEBIT" ? "−" : "";
  side.append(el("div", `tx-amount ${tx.direction.toLowerCase()}`, `${sign}${formatMoney(tx.amount)}`));
  if (tx.status !== "COMPLETED") {
    side.append(el("div", `tx-status ${tx.status.toLowerCase()}`, tx.status));
  } else {
    side.append(el("div", "tx-sub", shortId(tx.account)));
  }

  row.append(avatar(tx), main, side);
  const open = () => openTxDetail(tx);
  row.addEventListener("click", open);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  return row;
}

/**
 * Appends transactions to a container, inserting a month header ("October 2026")
 * whenever the month changes. Keeps track of the last month rendered so the next
 * page (Load more) continues the same group instead of repeating its header.
 */
function createTxListRenderer(container, { grouped = true, summaries = {} } = {}) {
  let lastMonth = null;
  let currentList = null;

  function monthHeader(key) {
    const header = el("div", "tx-month");
    header.append(el("span", "tx-month-label", monthLabel(key)));
    const s = summaries[key];
    if (s) {
      // Only show the sides that have money, e.g. just "Received ₹450.50"
      const parts = [];
      if (s.sent > 0) parts.push(el("span", "debit", `Sent ${formatMoney(s.sent)}`));
      if (s.received > 0) parts.push(el("span", "credit", `Received ${formatMoney(s.received)}`));
      if (parts.length) {
        const totals = el("span", "tx-month-totals");
        parts.forEach((part, i) => {
          if (i > 0) totals.append(document.createTextNode(" · "));
          totals.append(part);
        });
        header.append(totals);
      }
    }
    return header;
  }

  return {
    append(transactions) {
      for (const tx of transactions) {
        const key = monthKey(tx.createdAt);
        if (!currentList || (grouped && key !== lastMonth)) {
          if (grouped) container.append(monthHeader(key));
          currentList = el("ul", "tx-list");
          container.append(currentList);
          lastMonth = key;
        }
        currentList.append(renderTxRow(tx));
      }
    },
    reset() {
      container.textContent = "";
      lastMonth = null;
      currentList = null;
    },
  };
}

// ---- Detail sheet ----

let txDialog;

function detailRow(label, value, mono) {
  const row = el("div", "tx-detail-row");
  row.append(el("span", "tx-detail-label", label), el("span", mono ? "tx-detail-value mono" : "tx-detail-value", value));
  return row;
}

function openTxDetail(tx) {
  if (!txDialog) {
    txDialog = el("dialog", "tx-dialog");
    // Click on the backdrop (outside the content box) closes it
    txDialog.addEventListener("click", (e) => {
      if (e.target === txDialog) txDialog.close();
    });
    document.body.append(txDialog);
  }
  txDialog.textContent = "";

  const body = el("div", "tx-dialog-body");
  const sign = tx.direction === "CREDIT" ? "+" : tx.direction === "DEBIT" ? "−" : "";

  const head = el("div", "tx-dialog-head");
  head.append(
    avatar(tx),
    el("div", "tx-dialog-title", txTitle(tx)),
    el("div", `tx-dialog-amount ${tx.direction.toLowerCase()}`, `${sign}${formatMoney(tx.amount)}`),
    el("span", `tx-status ${tx.status.toLowerCase()}`, tx.status),
  );

  const counterpartyLabel = tx.direction === "CREDIT" ? "From account" : "To account";
  const myLabel = tx.direction === "CREDIT" ? "To your account" : "From your account";

  body.append(
    head,
    detailRow(
      "Date & time",
      new Date(tx.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    ),
    detailRow(tx.direction === "CREDIT" ? "From" : "To", tx.counterparty.name),
    detailRow(counterpartyLabel, tx.counterparty.accountId || "—", true),
    detailRow(myLabel, tx.account, true),
    detailRow("Transaction ID", tx._id, true),
  );

  const close = el("button", "secondary tx-dialog-close", "Close");
  close.addEventListener("click", () => txDialog.close());
  body.append(close);

  txDialog.append(body);
  txDialog.showModal();
}
