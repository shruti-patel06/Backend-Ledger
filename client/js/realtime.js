// Live updates: keeps one GET /api/events stream open and calls back when a transfer
// involving this user commits, so pages update without a refresh.
//
// Uses fetch + a stream reader rather than EventSource: EventSource can't send the
// Authorization header, and putting the token in the URL would leak it into logs.

let realtimeStopped = false;
let realtimeAbort = null;

// Splits a chunk of the stream into complete events. Returns the events and whatever
// trailing text is not a full event yet (it is prepended to the next chunk).
function parseSseChunk(buffer) {
  const events = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop();
  for (const block of blocks) {
    let name = "message";
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(":")) continue; // comment / heartbeat
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    try {
      events.push({ name, data: JSON.parse(dataLines.join("\n")) });
    } catch {
      // ignore a malformed event rather than dropping the connection
    }
  }
  return { events, rest };
}

function setLiveStatus(state) {
  const badge = document.getElementById("live-status");
  if (!badge) return;
  badge.hidden = false;
  badge.dataset.state = state;
  badge.querySelector(".live-text").textContent = state === "live" ? "Live" : state === "connecting" ? "Connecting..." : "Offline";
}

function stopRealtime() {
  realtimeStopped = true;
  if (realtimeAbort) realtimeAbort.abort();
}

/**
 * onTransaction(event) - a transfer touching this user committed
 * onResync()           - we may have missed events (reconnected, or tab became visible again)
 */
function startRealtime({ onTransaction, onResync }) {
  realtimeStopped = false;
  let attempt = 0;
  let connectedBefore = false;

  async function connect() {
    while (!realtimeStopped) {
      setLiveStatus(connectedBefore ? "offline" : "connecting");
      realtimeAbort = new AbortController();
      try {
        const res = await fetch(`${API_BASE_URL}/api/events`, {
          headers: { Authorization: `Bearer ${getToken()}`, Accept: "text/event-stream" },
          cache: "no-store",
          signal: realtimeAbort.signal,
        });

        // Token expired or revoked (e.g. logged out in another tab)
        if (res.status === 401) {
          clearSession();
          window.location.href = "login.html?reason=expired";
          return;
        }
        if (!res.ok || !res.body) throw new Error(`Event stream failed with status ${res.status}`);

        attempt = 0;
        setLiveStatus("live");
        // Anything that happened while we were disconnected was missed - reload once
        if (connectedBefore) onResync?.();
        connectedBefore = true;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseChunk(buffer);
          buffer = parsed.rest;
          for (const event of parsed.events) {
            if (event.name === "transaction") onTransaction?.(event.data);
          }
        }
      } catch {
        // network drop, server restart, or stopRealtime() - handled below
      }

      if (realtimeStopped) return;
      setLiveStatus("offline");
      // 1s, 2s, 4s ... capped at 15s, so a restarting server isn't hammered
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15000)));
      attempt++;
    }
  }

  // Browsers may pause a hidden tab's connection - catch up when it comes back
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && connectedBefore) onResync?.();
  });

  connect();
}
