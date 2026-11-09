"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyCsrf, issueToken, ensureToken } = require("../../middleware/csrf");

const ORIGIN = "http://localhost:5500";
function run(mw, { method = "POST", headers = {}, session = {} } = {}) {
  return new Promise(resolve => {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const req = { method, session, get: h => lower[h.toLowerCase()] };
    const res = {
      statusCode: 200, headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ passed: false, status: this.statusCode, body: b, headers: this.headers }); return this; }
    };
    mw(req, res, () => resolve({ passed: true }));
  });
}
const mw = verifyCsrf([ORIGIN], "X-CSRF-Token");

test("safe methods never need a token", async () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal((await run(mw, { method })).passed, true);
});
test("POST without a token is rejected with 403", async () => {
  const r = await run(mw, { session: { csrfToken: "abc" } });
  assert.equal(r.status, 403);
});
test("POST when the session has no token is rejected", async () => assert.equal((await run(mw, { headers: { "X-CSRF-Token": "abc" } })).status, 403));
test("matching token passes (header name is case-insensitive)", async () => {
  assert.equal((await run(mw, { headers: { "x-csrf-token": "tok123" }, session: { csrfToken: "tok123" } })).passed, true);
});
test("wrong or different-length token is rejected without throwing", async () => {
  assert.equal((await run(mw, { headers: { "X-CSRF-Token": "tok124" }, session: { csrfToken: "tok123" } })).status, 403);
  assert.equal((await run(mw, { headers: { "X-CSRF-Token": "short" }, session: { csrfToken: "a-much-longer-token" } })).status, 403);
});
test("a valid token does not rescue a request from a disallowed Origin", async () => {
  const r = await run(mw, { headers: { "X-CSRF-Token": "t", Origin: "https://evil.example" }, session: { csrfToken: "t" } });
  assert.equal(r.status, 403);
  assert.match(r.body.message, /origin/i);
});
test("allowed Origin plus valid token passes", async () => {
  assert.equal((await run(mw, { headers: { "X-CSRF-Token": "t", Origin: ORIGIN }, session: { csrfToken: "t" } })).passed, true);
});
test("issueToken creates a 64-hex token, reuses it, and disables caching", () => {
  const session = {};
  let body, headers = {};
  const res = { set(k, v) { headers[k] = v; return this; }, json(b) { body = b; } };
  issueToken({ session }, res);
  assert.match(body.csrfToken, /^[0-9a-f]{64}$/);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(ensureToken({ session }), body.csrfToken);
});
