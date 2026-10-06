const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const realtime = require("../services/realtime.service");

const router = Router();

/**
 * GET /api/events
 * - Server-Sent Events stream of live updates for the logged in user
 * - Stays open until the client disconnects or logs out
 */
router.get("/", authMiddleware.authMiddleware, (req, res) => {
  // No timeout on this socket - the stream is meant to stay open
  req.socket.setTimeout(0);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell nginx-style proxies not to buffer the stream
  });
  // retry: how long the browser waits before reconnecting on its own
  res.write("retry: 3000\n\n");
  res.write("event: ready\ndata: {}\n\n");

  const removeClient = realtime.addClient(
    req.user._id,
    authMiddleware.getTokenFromRequest(req),
    res,
  );
  req.on("close", removeClient);
});

module.exports = router;
