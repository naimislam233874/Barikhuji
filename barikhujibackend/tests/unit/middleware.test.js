"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const requireRole = require("../../middleware/requireRole");
const { errorHandler, notFound } = require("../../middleware/errorHandler");
const { stripOperatorKeys } = require("../../utils/sanitize");

function call(mw, req) {
  return new Promise(resolve => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ passed: false, status: this.statusCode, body: b }); } };
    mw(req, res, () => resolve({ passed: true }));
  });
}

test("requireRole: anonymous gets 401", async () => assert.equal((await call(requireRole("admin"), {})).status, 401));
test("requireRole: wrong role gets 403 (customer cannot reach admin or landlord routes)", async () => {
  assert.equal((await call(requireRole("admin"), { user: { role: "customer" } })).status, 403);
  assert.equal((await call(requireRole("landlord"), { user: { role: "customer" } })).status, 403);
  assert.equal((await call(requireRole("admin"), { user: { role: "landlord" } })).status, 403);
});
test("requireRole: allowed roles pass; several roles can be listed", async () => {
  assert.equal((await call(requireRole("admin"), { user: { role: "admin" } })).passed, true);
  assert.equal((await call(requireRole("landlord", "admin"), { user: { role: "landlord" } })).passed, true);
});
test("requireRole: misconfiguration fails at startup, not at request time", () => {
  assert.throws(() => requireRole(), /pass one or more/);
  assert.throws(() => requireRole("superuser"), /pass one or more/);
});

test("errorHandler hides internals in production", async () => {
  const handler = errorHandler({ isProd: true, isTest: true });
  const r = await new Promise(resolve => {
    const res = { headersSent: false, status(c) { this.c = c; return this; }, json(b) { resolve({ status: this.c, body: b }); } };
    handler(new Error("secret db detail at /srv/app.js:10"), { method: "GET", path: "/x" }, res, () => {});
  });
  assert.equal(r.status, 500);
  assert.equal(JSON.stringify(r.body).includes("secret"), false);
  assert.equal("detail" in r.body, false);
});
test("errorHandler maps oversized, malformed, duplicate-key and validation errors", async () => {
  const handler = errorHandler({ isProd: true, isTest: true });
  const run = err => new Promise(resolve => {
    const res = { headersSent: false, status(c) { this.c = c; return this; }, json(b) { resolve({ status: this.c, body: b }); } };
    handler(err, { method: "POST", path: "/x" }, res, () => {});
  });
  assert.equal((await run(Object.assign(new Error("x"), { type: "entity.too.large" }))).status, 413);
  assert.equal((await run(Object.assign(new Error("x"), { type: "entity.parse.failed" }))).status, 400);
  assert.equal((await run(Object.assign(new Error("x"), { code: 11000 }))).status, 409);
  const v = await run(Object.assign(new Error("x"), { name: "ValidationError", errors: { email: { message: "Enter a valid email address." } } }));
  assert.equal(v.status, 422);
  assert.equal(v.body.message, "Enter a valid email address.");
});
test("notFound returns 404 JSON", async () => {
  const r = await new Promise(resolve => notFound({}, { status(c) { this.c = c; return this; }, json(b) { resolve({ status: this.c, body: b }); } }));
  assert.equal(r.status, 404);
});

test("stripOperatorKeys removes $-keys, dotted keys and __proto__ (nested too)", () => {
  const body = JSON.parse('{"email":{"$gt":""},"a":{"b.c":1,"ok":2},"__proto__":{"x":1},"keep":"yes"}');
  const removed = stripOperatorKeys(body);
  assert.deepEqual(body, { email: {}, a: { ok: 2 }, keep: "yes" });
  assert.equal(removed, 3);
});
test("stripOperatorKeys tolerates null and primitives", () => {
  assert.equal(stripOperatorKeys(undefined), 0);
  assert.equal(stripOperatorKeys("text"), 0);
});
