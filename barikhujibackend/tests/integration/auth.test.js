"use strict";
// Full HTTP + MongoDB tests. They run ONLY when TEST_MONGODB_URI is set and its database name contains "test",
// because they delete every user and session in that database. Otherwise they are reported as skipped.
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const TEST_URI = process.env.TEST_MONGODB_URI || "";
let supertest, mongoose;
try { supertest = require("supertest"); mongoose = require("mongoose"); } catch (_) { /* run npm install */ }
const dbName = TEST_URI.replace(/^mongodb(\+srv)?:\/\/[^/]*\/?/, "").split("?")[0];
const skip = !supertest ? "dependencies not installed (run npm install)"
  : !TEST_URI ? "TEST_MONGODB_URI is not set"
  : !/test/i.test(dbName) ? 'TEST_MONGODB_URI database name must contain "test" (safety check)' : false;

const API = "/api/v1", ORIGIN = "http://localhost:5500";
const customer = { fullName: "Test Customer", email: "customer@example.com", phone: "01712345678", password: "Str0ngPass!9" };
const landlord = { fullName: "Test Landlord", email: "landlord@example.com", phone: "01812345678", password: "Str0ngPass!9" };

describe("auth API (integration)", { skip }, () => {
  let app, User, config, loadConfig, createApp;
  const envFor = extra => ({ NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4",
    RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000", RATE_LIMIT_REGISTER_MAX: "1000", ...extra });

  before(async () => {
    ({ loadConfig } = require("../../config/env"));
    const { connectDb } = require("../../config/db");
    ({ createApp } = require("../../app"));
    User = require("../../models/User");
    config = loadConfig(envFor());
    await connectDb(config.mongoUri);
    await User.init();
    await User.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    app = createApp(config);
    console.log("AUTH TEST APP:", typeof app, typeof app?.listen);
  });
  after(async () => {
    await User.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    await mongoose.disconnect();
  });

  const agent = (a = app) => supertest.agent(a);
  const token = async ag => (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
const post = async (ag, path, body, tok) => {
  const csrfToken = tok ?? await token(ag);

  return ag
    .post(`${API}${path}`)
    .set("Origin", ORIGIN)
    .set("X-CSRF-Token", csrfToken)
    .send(body);
};

  test("health reports the real database state", async () => {
    const r = await supertest(app).get(`${API}/health`);
    assert.equal(r.status, 200);
    assert.equal(r.body.database, "connected");
  });

  test("customer registration succeeds, never returns the hash, and does not log the user in", async () => {
    const ag = agent();
    const r = await post(ag, "/auth/customer/register", customer);
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, "customer");
    assert.equal(JSON.stringify(r.body).includes("passwordHash"), false);
    assert.equal(JSON.stringify(r.body).includes(customer.password), false);
    assert.equal((await ag.get(`${API}/auth/me`)).status, 401);
  });

  test("passwords are stored as bcrypt hashes, never as plaintext", async () => {
    const u = await User.findOne({ email: customer.email }).select("+passwordHash");
    assert.match(u.passwordHash, /^\$2[aby]\$/);
    assert.notEqual(u.passwordHash, customer.password);
  });

  test("landlord registration creates a landlord awaiting verification", async () => {
    const r = await post(agent(), "/auth/landlord/register", landlord);
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, "landlord");
    assert.equal(r.body.user.status, "pending_verification");
  });

  test("duplicate email (any letter case) is rejected with 409", async () => {
    const r = await post(agent(), "/auth/customer/register", { ...customer, email: "CUSTOMER@example.com", phone: "01911111111" });
    assert.equal(r.status, 409);
  });

  test("a role or status supplied by the client is ignored: nobody can self-register as admin", async () => {
    const r = await post(agent(), "/auth/customer/register", { ...customer, email: "sneaky@example.com", phone: "01611111111", role: "admin", status: "active" });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, "customer");
    assert.equal((await User.findOne({ email: "sneaky@example.com" })).role, "customer");
  });

  test("there is no public admin registration route", async () => {
    const r = await post(agent(), "/auth/admin/register", { ...customer, email: "admin@example.com" });
    assert.equal(r.status, 404);
    assert.equal(await User.countDocuments({ role: "admin" }), 0);
  });

  test("invalid input gets a clear 422 message", async () => {
    const weak = await post(agent(), "/auth/customer/register", { ...customer, email: "weak@example.com", phone: "01511111111", password: "short" });
    assert.equal(weak.status, 422);
    assert.match(weak.body.message, /at least 8/);
    const badPhone = await post(agent(), "/auth/customer/register", { ...customer, email: "bp@example.com", phone: "123" });
    assert.equal(badPhone.status, 422);
    const injected = await post(agent(), "/auth/customer/login", { email: { $gt: "" }, password: { $gt: "" } });
    assert.equal(injected.status, 422);
  });

  test("login succeeds, a new CSRF token is issued, and the session persists", async () => {
    const ag = agent();
    const r = await post(ag, "/auth/customer/login", { email: customer.email, password: customer.password });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.email, customer.email);
    assert.ok(r.body.csrfToken);
    const cookie = (r.headers["set-cookie"] || []).join(";");
    assert.match(cookie, /bk\.sid=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const me = await ag.get(`${API}/auth/me`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, customer.email);
  });

  test("failed logins return the same generic message for unknown email, wrong password and wrong portal", async () => {
    const wrongPw = await post(agent(), "/auth/customer/login", { email: customer.email, password: "Wrong-pass-1" });
    const unknown = await post(agent(), "/auth/customer/login", { email: "nobody@example.com", password: "Wrong-pass-1" });
    const wrongPortal = await post(agent(), "/auth/landlord/login", { email: customer.email, password: customer.password });
    for (const r of [wrongPw, unknown, wrongPortal]) { assert.equal(r.status, 401); assert.equal(r.body.message, "Invalid email or password."); }
  });

  test("a customer cannot sign in through the admin login", async () => {
    const r = await post(agent(), "/auth/admin/login", { email: customer.email, password: customer.password });
    assert.equal(r.status, 401);
  });

  test("login issues a NEW session id (session-fixation defence)", async () => {
    const ag = agent();
    const t = await token(ag);
    const before = (await ag.get(`${API}/auth/csrf`)).headers["set-cookie"];
    const r = await post(ag, "/auth/customer/login", { email: customer.email, password: customer.password }, t);
    const after = r.headers["set-cookie"];
    assert.ok(after && after.length);
    if (before) assert.notEqual(before[0].split(";")[0], after[0].split(";")[0]);
  });

  test("state-changing requests without a CSRF token are rejected, even with a valid session", async () => {
    const ag = agent();
    await post(ag, "/auth/customer/login", { email: customer.email, password: customer.password });
    const r = await ag.post(`${API}/auth/logout`).set("Origin", ORIGIN);
    assert.equal(r.status, 403);
    assert.equal((await ag.get(`${API}/auth/me`)).status, 200); // still signed in
  });

  test("requests from a foreign Origin are rejected", async () => {
    const ag = agent();
    const t = await token(ag);
    const r = await ag.post(`${API}/auth/customer/login`).set("Origin", "https://evil.example").set("X-CSRF-Token", t).send({ email: customer.email, password: customer.password });
    assert.equal(r.status, 403);
  });

  test("logout destroys the session: the old cookie no longer works", async () => {
    const ag = agent();
    const login = await post(ag, "/auth/customer/login", { email: customer.email, password: customer.password });
    const out = await post(ag, "/auth/logout", {}, login.body.csrfToken);
    assert.equal(out.status, 204);
    assert.equal((await ag.get(`${API}/auth/me`)).status, 401);
  });

  test("a suspended account is signed out and cannot sign in", async () => {
    const ag = agent();
    await post(ag, "/auth/customer/login", { email: customer.email, password: customer.password });
    await User.updateOne({ email: customer.email }, { status: "suspended" });
    assert.equal((await ag.get(`${API}/auth/me`)).status, 401);
    assert.equal((await post(agent(), "/auth/customer/login", { email: customer.email, password: customer.password })).status, 403);
    await User.updateOne({ email: customer.email }, { status: "active" });
  });

  test("/auth/me requires a session", async () => assert.equal((await supertest(app).get(`${API}/auth/me`)).status, 401));

  test("unknown API routes return a JSON 404", async () => {
    const r = await supertest(app).get(`${API}/nope`);
    assert.equal(r.status, 404);
    assert.equal(r.body.message, "Not found.");
  });

  test("login rate limiting returns 429 after repeated failures", async () => {
    const limited = createApp(loadConfig(envFor({ RATE_LIMIT_LOGIN_IP_MAX: "3" })));
    const ag = agent(limited);
    const t = await token(ag);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await post(ag, "/auth/customer/login", { email: "nobody@example.com", password: "Wrong-pass-1" }, t)).status);
    assert.deepEqual(codes.slice(0, 3), [401, 401, 401]);
    assert.ok(codes.slice(3).every(c => c === 429), `expected 429 after the limit, got ${codes}`);
  });

  test("CORS allows the configured origin with credentials and nothing else", async () => {
    const ok = await supertest(app).get(`${API}/health`).set("Origin", ORIGIN);
    assert.equal(ok.headers["access-control-allow-origin"], ORIGIN);
    assert.equal(ok.headers["access-control-allow-credentials"], "true");
    const bad = await supertest(app).get(`${API}/health`).set("Origin", "https://evil.example");
    assert.equal(bad.headers["access-control-allow-origin"], undefined);
  });

  test("security headers are present and x-powered-by is hidden", async () => {
    const r = await supertest(app).get(`${API}/health`);
    assert.ok(r.headers["x-content-type-options"]);
    assert.equal(r.headers["x-powered-by"], undefined);
  });

  test("oversized request bodies are rejected", async () => {
    const r = await supertest(app).post(`${API}/auth/customer/login`).set("Origin", ORIGIN).send({ email: "a@b.co", password: "x".repeat(20000) });
    assert.equal(r.status, 413);
  });
});
