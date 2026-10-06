/**
 * Live updates over Server-Sent Events (SSE).
 *
 * Each logged-in browser tab keeps one GET /api/events connection open. When a
 * transfer commits, the controller calls publishTransfer() and the sender and the
 * recipient are told immediately, so their pages update without a refresh.
 *
 * Connections live in memory, which is correct for a single server instance (the
 * Render free tier). Running several instances would need a shared channel such as
 * Redis pub/sub so an event reaches whichever instance holds the user's connection.
 */

const HEARTBEAT_MS = 25 * 1000;

// userId -> Set of { res, token }. A user can have several tabs/devices open.
const clients = new Map();

function addClient(userId, token, res) {
  const key = String(userId);
  const client = { res, token };
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(client);

  return function removeClient() {
    const set = clients.get(key);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) clients.delete(key);
  };
}

function send(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection already gone - its "close" handler removes it
  }
}

function publish(userId, event, data) {
  const set = clients.get(String(userId));
  if (!set) return;
  for (const client of set) send(client, event, data);
}

/**
 * Tells both sides of a committed transfer. Only the user's own side is sent:
 * direction is relative to the receiver of the event, never the other user's account.
 *   transaction - { _id, amount }
 *   from / to   - { userId, accountId, name }
 *
 * Runs after the money has already moved, so it must never throw: a failure here
 * would turn a successful transfer into an error response.
 */
function publishTransfer(transaction, from, to) {
  try {
    const base = { transactionId: String(transaction._id), amount: transaction.amount };

    if (from.userId && String(from.userId) === String(to.userId)) {
      publish(from.userId, "transaction", { ...base, direction: "SELF", accountId: String(from.accountId) });
      return;
    }
    if (from.userId) {
      publish(from.userId, "transaction", {
        ...base,
        direction: "DEBIT",
        accountId: String(from.accountId),
        counterpartyName: to.name || "Unknown user",
      });
    }
    if (to.userId) {
      publish(to.userId, "transaction", {
        ...base,
        direction: "CREDIT",
        accountId: String(to.accountId),
        counterpartyName: from.name || "Unknown user",
      });
    }
  } catch (error) {
    console.error("Error publishing live update:", error);
  }
}

// Used on logout: a revoked token must not keep receiving events
function closeByToken(token) {
  for (const set of clients.values()) {
    for (const client of set) {
      if (client.token === token) client.res.end();
    }
  }
}

// One timer for all connections. The comment line keeps proxies (Render, browsers)
// from closing a connection that has been quiet for a while
const heartbeat = setInterval(() => {
  for (const set of clients.values()) {
    for (const client of set) {
      try {
        client.res.write(": ping\n\n");
      } catch {
        // see send()
      }
    }
  }
}, HEARTBEAT_MS);
heartbeat.unref(); // don't keep the process alive just for this timer

module.exports = {
  addClient,
  publish,
  publishTransfer,
  closeByToken,
};
