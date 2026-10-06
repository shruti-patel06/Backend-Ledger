// Opened locally (localhost or straight from disk) -> talk to the API running via `npm run dev`.
// Anywhere else (the Vercel deployment) -> talk to the deployed backend on Render.
const IS_LOCAL =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
  window.location.protocol === "file:";

const API_BASE_URL = IS_LOCAL
  ? "http://localhost:3000"
  : "https://backend-ledger-6mo0.onrender.com";
