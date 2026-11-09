"use strict";
// CSRF protection for cookie sessions (synchronizer-token pattern, no deprecated packages):
//   1. The client calls GET /api/v1/auth/csrf and receives { csrfToken }. The token is stored in the server-side session.
//   2. For every POST/PUT/PATCH/DELETE the client sends it in the CSRF header (default X-CSRF-Token).
//   3. We compare it with the session copy in constant time. A forged cross-site request cannot read the token.
//   4. Defence in depth: if the browser sends an Origin header it must be on the allowlist.
// Login creates a NEW session (session-fixation defence), so clients must fetch a fresh token after login/logout.
const crypto = require("crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function ensureToken(req) {
  if (!req.session) throw new Error("csrf: the session middleware must run first");
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function issueToken(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({ csrfToken: ensureToken(req) });
}

function verifyCsrf(allowedOrigins, headerName = "X-CSRF-Token") {
  const forbid = (res, message) => res.status(403).json({ message });
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    if (origin && !allowedOrigins.includes(origin)) return forbid(res, "Request origin is not allowed.");
    const supplied = req.get(headerName);
    const expected = req.session && req.session.csrfToken;
    if (!expected || !supplied || !safeEqual(supplied, expected)) {
      return forbid(res, "Invalid or missing security token. Reload the page and try again.");
    }
    next();
  };
}

module.exports = { ensureToken, issueToken, verifyCsrf };
