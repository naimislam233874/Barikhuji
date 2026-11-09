"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig, ConfigError } = require("../../config/env");

const GOOD_SECRET = "a".repeat(8) + "Zk3-" + "x9Qm2pLw7Rt5Vb8N-".repeat(2);
const base = { NODE_ENV: "development", MONGODB_URI: "mongodb://127.0.0.1:27017/x", SESSION_SECRET: GOOD_SECRET };

test("development config loads with safe defaults", () => {
  const c = loadConfig(base);
  assert.equal(c.port, 5000);
  assert.equal(c.session.cookie.secure, false);
  assert.equal(c.session.cookie.sameSite, "lax");
  assert.deepEqual(c.frontendOrigins, ["http://localhost:5500", "http://127.0.0.1:5500"]);
  assert.equal(c.bcryptRounds, 12);
});
test("missing MONGODB_URI and SESSION_SECRET are both reported", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "development" }), err => err instanceof ConfigError && /MONGODB_URI/.test(err.message) && /SESSION_SECRET/.test(err.message));
});
test("short or placeholder secrets are rejected and never echoed", () => {
  assert.throws(() => loadConfig({ ...base, SESSION_SECRET: "short" }), /SESSION_SECRET/);
  const placeholder = "change-me-change-me-change-me-change-me-1234";
  assert.throws(() => loadConfig({ ...base, SESSION_SECRET: placeholder }), err => /placeholder/.test(err.message) && !err.message.includes(placeholder));
});
test("production demands https origins, secure cookies and an explicit origin list", () => {
  assert.throws(() => loadConfig({ ...base, NODE_ENV: "production" }), /FRONTEND_ORIGIN is required/);
  assert.throws(() => loadConfig({ ...base, NODE_ENV: "production", FRONTEND_ORIGIN: "http://example.org" }), /https/);
  const c = loadConfig({ ...base, NODE_ENV: "production", FRONTEND_ORIGIN: "https://barikhuji.com" });
  assert.equal(c.session.cookie.secure, true);
  assert.throws(() => loadConfig({ ...base, NODE_ENV: "production", FRONTEND_ORIGIN: "https://barikhuji.com", COOKIE_SECURE: "false" }), /COOKIE_SECURE/);
});
test("origins must be bare origins (no wildcard, no path)", () => {
  assert.throws(() => loadConfig({ ...base, FRONTEND_ORIGIN: "*" }), /invalid entry/);
  assert.throws(() => loadConfig({ ...base, FRONTEND_ORIGIN: "http://localhost:5500/app" }), /bare origins/);
  assert.deepEqual(loadConfig({ ...base, FRONTEND_ORIGIN: "http://localhost:5500/" }).frontendOrigins, ["http://localhost:5500"]);
});
test("sameSite=none requires secure cookies; unknown values are rejected", () => {
  assert.throws(() => loadConfig({ ...base, COOKIE_SAMESITE: "none" }), /requires COOKIE_SECURE/);
  assert.throws(() => loadConfig({ ...base, COOKIE_SAMESITE: "weird" }), /COOKIE_SAMESITE/);
});
test("test mode supplies a throwaway secret and fast bcrypt rounds", () => {
  const c = loadConfig({ NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1/x_test" });
  assert.equal(c.bcryptRounds, 4);
  assert.ok(c.session.secret.length >= 32);
});
test("low bcrypt rounds are refused outside tests", () => {
  assert.throws(() => loadConfig({ ...base, BCRYPT_ROUNDS: "5" }), /BCRYPT_ROUNDS/);
});
test("script mode can skip session and database requirements", () => {
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: "development" }, { requireSession: false, requireDb: false }));
});
