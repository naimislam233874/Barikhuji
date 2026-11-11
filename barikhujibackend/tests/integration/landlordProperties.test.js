"use strict";
// Full HTTP + MongoDB tests for /api/v1/landlord/*. They run ONLY when TEST_MONGODB_URI is set and its database name
// contains "test" (they delete every user, listing and session in that database). Otherwise they are reported as skipped.
// `npm test` runs files one at a time (--test-concurrency=1) because the integration files share that database.
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const TEST_URI = process.env.TEST_MONGODB_URI || "";
let supertest, mongoose, bcrypt;
try { supertest = require("supertest"); mongoose = require("mongoose"); bcrypt = require("bcryptjs"); } catch (_) { /* run npm install */ }
const dbName = TEST_URI.replace(/^mongodb(\+srv)?:\/\/[^/]*\/?/, "").split("?")[0];
const skip = !supertest || !bcrypt ? "dependencies not installed (run npm install)"
  : !TEST_URI ? "TEST_MONGODB_URI is not set"
  : !/test/i.test(dbName) ? 'TEST_MONGODB_URI database name must contain "test" (safety check)' : false;

const API = "/api/v1", ORIGIN = "http://localhost:5500", PASSWORD = "Str0ngPass!9";
const today = new Date().toISOString().slice(0, 10);
const listing = (over = {}) => ({
  title: "Sunny 2-Bed Flat near Dhanmondi Lake", description: "Bright, airy flat on the 4th floor with a balcony and a quiet neighbourhood.",
  type: "Apartment", furnished: "Semi-furnished", city: "Dhaka", area: "Dhanmondi", address: "House 5, Road 3",
  rent: 28000, deposit: 56000, bedrooms: 2, bathrooms: 2, availableFrom: today,
  suitableFor: ["Family", "Bachelor"], amenities: ["Lift", "Gas"], images: ["https://images.example.com/flat-1.jpg"], ...over
});

describe("landlord property API (integration)", { skip }, () => {
  let app, Property, User, A, B, customer, admin;       // A, B = signed-in sessions of two different landlords
  const emailOf = { A: "landlord.a@example.com", B: "landlord.b@example.com" };

  const post = async (ag, path, body, tok) => ag.post(`${API}${path}`).set("Origin", ORIGIN).set("X-CSRF-Token", tok).send(body);
  async function signIn(portal, email) {
    const ag = supertest.agent(app);
    const t0 = (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const r = await post(ag, `/auth/${portal}/login`, { email, password: PASSWORD }, t0);
    assert.equal(r.status, 200, `login failed for ${email}`);
    return { ag, csrf: r.body.csrfToken };
  }
  const call = (s, method, path, body) => {
    let rq = s.ag[method](`${API}${path}`).set("Origin", ORIGIN);
    if (method !== "get") rq = rq.set("X-CSRF-Token", s.csrf);
    return body === undefined ? rq : rq.send(body);
  };
  const create = async (s, over) => { const r = await call(s, "post", "/landlord/properties", listing(over)); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; };
  // Simulates an admin decision (the admin API is a later step).
  const setStatus = (id, status) => Property.updateOne({ _id: id }, { status, reviewedAt: new Date() });

  before(async () => {
    const { loadConfig } = require("../../config/env");
    const { connectDb } = require("../../config/db");
    const { createApp } = require("../../app");
    User = require("../../models/User"); Property = require("../../models/Property");
    const config = loadConfig({ NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4",
      RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000", RATE_LIMIT_REGISTER_MAX: "1000" });
    await connectDb(config.mongoUri);
    await User.init(); await Property.init();
    for (const M of [User, Property]) await M.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    app = createApp(config);

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await User.create([
      { name: "Landlord A", email: emailOf.A, phone: "01711111111", passwordHash, role: "landlord", status: "pending_verification" },
      { name: "Landlord B", email: emailOf.B, phone: "01822222222", passwordHash, role: "landlord", status: "active" },
      { name: "A Customer", email: "customer@example.com", phone: "01933333333", passwordHash, role: "customer" },
      { name: "An Admin", email: "admin@example.com", passwordHash, role: "admin" }
    ]);
    A = await signIn("landlord", emailOf.A); B = await signIn("landlord", emailOf.B);
    customer = await signIn("customer", "customer@example.com"); admin = await signIn("admin", "admin@example.com");
  });
  after(async () => {
    for (const M of [User, Property]) await M.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    await mongoose.disconnect();
  });

  // ---------- authorization ----------
  test("anonymous requests are rejected with 401 (reads) and 401 after CSRF (writes)", async () => {
    const anon = supertest.agent(app);
    assert.equal((await anon.get(`${API}/landlord/properties`).set("Origin", ORIGIN)).status, 401);
    assert.equal((await anon.get(`${API}/landlord/stats`).set("Origin", ORIGIN)).status, 401);
    const tok = (await anon.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    assert.equal((await post(anon, "/landlord/properties", listing(), tok)).status, 401);
  });
  test("writes without a CSRF token are rejected even for a signed-in landlord", async () => {
    const r = await A.ag.post(`${API}/landlord/properties`).set("Origin", ORIGIN).send(listing());
    assert.equal(r.status, 403);
  });
  test("customers and admins cannot use the landlord API (403 on every route)", async () => {
    const id = "507f1f77bcf86cd799439011";
    for (const who of [customer, admin]) {
      assert.equal((await call(who, "get", "/landlord/properties")).status, 403);
      assert.equal((await call(who, "get", "/landlord/stats")).status, 403);
      assert.equal((await call(who, "post", "/landlord/properties", listing())).status, 403);
      assert.equal((await call(who, "get", `/landlord/properties/${id}`)).status, 403);
      assert.equal((await call(who, "put", `/landlord/properties/${id}`, listing())).status, 403);
      assert.equal((await call(who, "patch", `/landlord/properties/${id}/status`, { status: "paused" })).status, 403);
      assert.equal((await call(who, "delete", `/landlord/properties/${id}`)).status, 403);
    }
    assert.equal(await Property.countDocuments(), 0);
  });

  // ---------- creation ----------
  test("a landlord can create a listing: 201, pending_review, owned by the session user", async () => {
    const p = await create(A);
    assert.equal(p.status, "pending_review"); assert.equal(p.verified, false); assert.equal(p.featured, false);
    assert.equal("landlord" in p, false);
    const row = await Property.findById(p.id);
    const a = await User.findOne({ email: emailOf.A });
    assert.equal(String(row.landlord), String(a._id));
    assert.equal((await User.findOne({ email: emailOf.A })).status, "pending_verification"); // landlord account untouched
  });
  test("mass assignment: client-supplied status, landlord, featured, verified, views and reviewer are ignored", async () => {
    const b = await User.findOne({ email: emailOf.B });
    const r = await call(A, "post", "/landlord/properties", listing({ status: "active", landlord: String(b._id), featured: true, verified: true, views: 5000, reviewedBy: String(b._id), reviewedAt: new Date().toISOString() }));
    assert.equal(r.status, 201);
    const row = await Property.findById(r.body.id);
    const a = await User.findOne({ email: emailOf.A });
    assert.equal(row.status, "pending_review"); assert.equal(String(row.landlord), String(a._id));
    assert.equal(row.featured, false); assert.equal(row.verified, false); assert.equal(row.views, 0);
    assert.equal(row.reviewedBy, undefined); assert.equal(row.reviewedAt, undefined);
  });
  test("invalid data gets 422 with a clear message and nothing is saved", async () => {
    const before = await Property.countDocuments();
    for (const [over, re] of [[{ rent: -1 }, /Rent/], [{ title: "tiny" }, /Title/], [{ type: "Castle" }, /type/i], [{ suitableFor: [] }, /Suitable/i], [{ availableFrom: "2026-02-30" }, /date/i], [{ images: ["javascript:alert(1)"] }, /Photo/i]]) {
      const r = await call(A, "post", "/landlord/properties", listing(over));
      assert.equal(r.status, 422, JSON.stringify(over)); assert.match(r.body.message, re);
    }
    assert.equal(await Property.countDocuments(), before);
  });
  test("text/plain gets 415 while valid multipart form data is accepted", async () => {
    const plain = await A.ag.post(`${API}/landlord/properties`).set("Origin", ORIGIN).set("X-CSRF-Token", A.csrf).set("Content-Type", "text/plain").send("x");
    assert.equal(plain.status, 415);
  });

  // ---------- reading and ownership ----------
  test("the list shows only my listings, in the shape the dashboard expects", async () => {
    await create(B, { title: "Landlord B's own flat in Gulshan" });
    const r = await call(A, "get", "/landlord/properties");
    assert.equal(r.status, 200); assert.ok(Array.isArray(r.body));
    assert.ok(r.body.length >= 2);
    for (const it of r.body) { for (const k of ["id", "title", "area", "rent", "status", "views", "inquiries"]) assert.ok(k in it, k); assert.notEqual(it.title, "Landlord B's own flat in Gulshan"); }
  });
  test("ownership: another landlord gets 404 for GET, PUT, PATCH and DELETE, and the listing is untouched", async () => {
    const mine = await create(A, { title: "Landlord A's private listing here" });
    const body = listing({ title: "Hijacked by landlord B right now" });
    assert.equal((await call(B, "get", `/landlord/properties/${mine.id}`)).status, 404);
    assert.equal((await call(B, "put", `/landlord/properties/${mine.id}`, body)).status, 404);
    await setStatus(mine.id, "active");
    assert.equal((await call(B, "patch", `/landlord/properties/${mine.id}/status`, { status: "paused" })).status, 404);
    assert.equal((await call(B, "delete", `/landlord/properties/${mine.id}`)).status, 404);
    const row = await Property.findById(mine.id);
    assert.equal(row.title, "Landlord A's private listing here"); assert.equal(row.status, "active");
  });
  test("malformed and unknown ids return 404, not 500", async () => {
    for (const id of ["not-an-id", "123", "507f1f77bcf86cd799439011"]) assert.equal((await call(A, "get", `/landlord/properties/${id}`)).status, 404, id);
  });

  // ---------- editing and re-review ----------
  test("editing an approved listing's content returns it to pending_review and clears the old review", async () => {
    const p = await create(A); await setStatus(p.id, "active");
    const r = await call(A, "put", `/landlord/properties/${p.id}`, listing({ rent: 31000 }));
    assert.equal(r.status, 200); assert.equal(r.body.status, "pending_review"); assert.equal(r.body.rent, 31000);
    assert.equal(r.body.reviewedAt, undefined);
    assert.equal((await Property.findById(p.id)).reviewedBy, undefined);
  });
  test("a PUT with identical content leaves an approved listing active", async () => {
    const p = await create(A); await setStatus(p.id, "active");
    const r = await call(A, "put", `/landlord/properties/${p.id}`, listing({ suitableFor: ["Bachelor", "Family"], amenities: ["Gas", "Lift"] }));
    assert.equal(r.status, 200); assert.equal(r.body.status, "active");
  });
  test("editing a paused or rejected listing sends it to review; a pending one stays pending", async () => {
    for (const [from, to] of [["paused", "pending_review"], ["rejected", "pending_review"], ["pending_review", "pending_review"]]) {
      const p = await create(A); if (from !== "pending_review") await setStatus(p.id, from);
      const r = await call(A, "put", `/landlord/properties/${p.id}`, listing({ title: `Edited while ${from} for the test` }));
      assert.equal(r.body.status, to, from);
    }
  });
  test("editing cannot set status, featured or verified, and a PUT without photos keeps the old photos", async () => {
    const p = await create(A);
    const r = await call(A, "put", `/landlord/properties/${p.id}`, { ...listing({ images: undefined }), status: "active", featured: true, verified: true });
    assert.equal(r.status, 200); assert.equal(r.body.status, "pending_review");
    const row = await Property.findById(p.id);
    assert.equal(row.featured, false); assert.equal(row.verified, false);
    assert.deepEqual([...row.images], ["https://images.example.com/flat-1.jpg"]);
  });

  // ---------- status transitions ----------
  test("an approved listing can be paused and resumed; the same status is accepted as a no-op", async () => {
    const p = await create(A); await setStatus(p.id, "active");
    assert.equal((await call(A, "patch", `/landlord/properties/${p.id}/status`, { status: "paused" })).body.status, "paused");
    assert.equal((await call(A, "patch", `/landlord/properties/${p.id}/status`, { status: "paused" })).status, 200);
    assert.equal((await call(A, "patch", `/landlord/properties/${p.id}/status`, { status: "active" })).body.status, "active");
  });
  test("a pending listing cannot be activated or paused by its landlord (409), and nothing changes", async () => {
    const p = await create(A);
    for (const s of ["active", "paused"]) assert.equal((await call(A, "patch", `/landlord/properties/${p.id}/status`, { status: s })).status, 409);
    assert.equal((await Property.findById(p.id)).status, "pending_review");
  });
  test("a rejected listing cannot be reactivated (409)", async () => {
    const p = await create(A); await setStatus(p.id, "rejected");
    assert.equal((await call(A, "patch", `/landlord/properties/${p.id}/status`, { status: "active" })).status, 409);
    assert.equal((await Property.findById(p.id)).status, "rejected");
  });
  test("landlords cannot choose pending_review, rejected, approved or invalid statuses (422)", async () => {
    const p = await create(A); await setStatus(p.id, "active");
    for (const s of ["pending_review", "rejected", "approved", "ACTIVE", "", 1, null]) assert.equal((await call(A, "patch", `/landlord/properties/${p.id}/status`, { status: s })).status, 422, String(s));
    assert.equal((await Property.findById(p.id)).status, "active");
  });

  // ---------- delete and stats ----------
  test("a landlord can delete their own listing; it is gone afterwards", async () => {
    const p = await create(A);
    assert.equal((await call(A, "delete", `/landlord/properties/${p.id}`)).status, 204);
    assert.equal((await call(A, "get", `/landlord/properties/${p.id}`)).status, 404);
    assert.equal((await call(A, "delete", `/landlord/properties/${p.id}`)).status, 404);
  });
  test("stats count only my listings: active, pending, total views, inquiries", async () => {
    await Property.deleteMany({});
    const p1 = await create(A), p2 = await create(A), p3 = await create(A); await create(B);
    await setStatus(p1.id, "active"); await setStatus(p3.id, "paused");
    await Property.updateOne({ _id: p1.id }, { views: 10 }); await Property.updateOne({ _id: p2.id }, { views: 5 });
    const r = await call(A, "get", "/landlord/stats");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { activeListings: 1, pendingListings: 1, views: 15, inquiries: 0 });
  });
  test("responses are not cacheable", async () => {
    assert.match((await call(A, "get", "/landlord/properties")).headers["cache-control"], /no-store/);
  });
});

