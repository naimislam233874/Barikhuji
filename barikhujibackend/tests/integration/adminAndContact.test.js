"use strict";
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const TEST_URI = process.env.TEST_MONGODB_URI || "";
let supertest, mongoose, bcrypt;
try { supertest = require("supertest"); mongoose = require("mongoose"); bcrypt = require("bcryptjs"); } catch (_) {}
const dbName = TEST_URI.replace(/^mongodb(\+srv)?:\/\/[^/]*\/?/, "").split("?")[0];
const skip = !supertest || !bcrypt ? "dependencies not installed"
  : !TEST_URI ? "TEST_MONGODB_URI is not set"
  : !/test/i.test(dbName) ? 'TEST_MONGODB_URI database name must contain "test"' : false;

const API = "/api/v1", ORIGIN = "http://localhost:5500", PASSWORD = "Str0ngPass!9";
const today = new Date().toISOString().slice(0, 10);

describe("admin permissions, moderation, inquiries & contact (integration)", { skip }, () => {
  let app, User, Property, Inquiry, ContactMessage, ModerationLog;
  let customer, landlord, admin, adminId, landlordId, customerId, propId;

  async function signIn(portal, email) {
    const ag = supertest.agent(app);
    const csrf0 = (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const r = await ag.post(`${API}/auth/${portal}/login`).set("Origin", ORIGIN).set("X-CSRF-Token", csrf0).send({ email, password: PASSWORD });
    assert.equal(r.status, 200);
    return { ag, csrf: r.body.csrfToken, user: r.body.user };
  }
  const call = (s, method, path, body) => {
    let rq = s.ag[method](`${API}${path}`).set("Origin", ORIGIN);
    if (method !== "get") rq = rq.set("X-CSRF-Token", s.csrf);
    return body === undefined ? rq : rq.send(body);
  };

  before(async () => {
    const { loadConfig } = require("../../config/env");
    const { connectDb } = require("../../config/db");
    const { createApp } = require("../../app");
    User = require("../../models/User");
    Property = require("../../models/Property");
    Inquiry = require("../../models/Inquiry");
    ContactMessage = require("../../models/ContactMessage");
    ModerationLog = require("../../models/ModerationLog");

    const config = loadConfig({
      NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4",
      RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000", RATE_LIMIT_REGISTER_MAX: "1000"
    });
    await connectDb(config.mongoUri);
    await Promise.all([User.init(), Property.init(), Inquiry.init(), ContactMessage.init(), ModerationLog.init()]);
    await Promise.all([
      User.deleteMany({}), Property.deleteMany({}), Inquiry.deleteMany({}), ContactMessage.deleteMany({}), ModerationLog.deleteMany({}),
      mongoose.connection.collection("sessions").deleteMany({})
    ]);
    app = createApp(config);

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const [uC, uL, uA] = await User.create([
      { name: "Admin Test Customer", email: "adm.cust@example.com", phone: "01740000001", passwordHash, role: "customer", status: "active" },
      { name: "Admin Test Landlord", email: "adm.land@example.com", phone: "01740000002", passwordHash, role: "landlord", status: "pending_verification" },
      { name: "Admin Test Admin", email: "adm.boss@example.com", phone: "01740000003", passwordHash, role: "admin", status: "active" }
    ]);
    customerId = String(uC._id);
    landlordId = String(uL._id);
    adminId = String(uA._id);

    customer = await signIn("customer", "adm.cust@example.com");
    landlord = await signIn("landlord", "adm.land@example.com");
    admin = await signIn("admin", "adm.boss@example.com");

    const pRes = await call(landlord, "post", "/landlord/properties", {
      title: "Admin Review Flat in Bashundhara",
      description: "Spacious flat in Bashundhara R/A Block B with backup generator and security.",
      type: "Apartment", furnished: "Semi-furnished", city: "Dhaka", area: "Bashundhara",
      rent: 30000, deposit: 60000, bedrooms: 3, bathrooms: 2, availableFrom: today, suitableFor: ["Family"]
    });
    assert.equal(pRes.status, 201);
    propId = pRes.body.id;
  });

  after(async () => {
    await Promise.all([
      User.deleteMany({}), Property.deleteMany({}), Inquiry.deleteMany({}), ContactMessage.deleteMany({}), ModerationLog.deleteMany({}),
      mongoose.connection.collection("sessions").deleteMany({})
    ]);
    await mongoose.disconnect();
  });

  test("customers and landlords are denied access to all admin routes (403); anonymous gets 401", async () => {
    assert.equal((await supertest(app).get(`${API}/admin/overview`)).status, 401);
    for (const nonAdmin of [customer, landlord]) {
      assert.equal((await call(nonAdmin, "get", "/admin/overview")).status, 403);
      assert.equal((await call(nonAdmin, "get", "/admin/properties")).status, 403);
      assert.equal((await call(nonAdmin, "get", "/admin/users")).status, 403);
      assert.equal((await call(nonAdmin, "get", "/admin/bookings")).status, 403);
      assert.equal((await call(nonAdmin, "get", "/admin/moderation-history")).status, 403);
      assert.equal((await call(nonAdmin, "post", `/admin/properties/${propId}/review`, { decision: "approved" })).status, 403);
      assert.equal((await call(nonAdmin, "patch", `/admin/users/${customerId}/status`, { status: "suspended" })).status, 403);
    }
  });

  test("contact submission creates open report visible in admin overview & reports", async () => {
    const ag = supertest.agent(app);
    const tok = (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const bad = await ag.post(`${API}/contact`).set("Origin", ORIGIN).set("X-CSRF-Token", tok).send({ name: "A", email: "bad", message: "short" });
    assert.equal(bad.status, 422);

    const ok = await ag.post(`${API}/contact`).set("Origin", ORIGIN).set("X-CSRF-Token", tok).send({
      name: "Concerned Renter", email: "renter@example.com", phone: "01755000011",
      subject: "Report a listing or scam", message: "Please review this listing for suspicious pricing."
    });
    assert.equal(ok.status, 201);

    const ov = await call(admin, "get", "/admin/overview");
    assert.equal(ov.status, 200);
    assert.equal(ov.body.stats.openReports, 1);

    const reps = await call(admin, "get", "/admin/reports");
    assert.equal(reps.status, 200);
    assert.equal(reps.body.items[0].status, "open");

    const resolved = await call(admin, "patch", `/admin/reports/${reps.body.items[0].id}`, { status: "resolved" });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.report.status, "resolved");
  });

  test("admin reviews property, toggles flags, manages users, and records moderation history", async () => {
    // Invalid review decision -> 422
    assert.equal((await call(admin, "post", `/admin/properties/${propId}/review`, { decision: "maybe" })).status, 422);

    // Approve property -> becomes active and publicly visible
    const rev = await call(admin, "post", `/admin/properties/${propId}/review`, { decision: "approved", note: "Documents checked" });
    assert.equal(rev.status, 200);
    assert.equal(rev.body.property.status, "active");
    assert.equal((await supertest(app).get(`${API}/properties/${propId}`)).status, 200);

    // Toggle featured flag
    const flag = await call(admin, "patch", `/admin/properties/${propId}/flags`, { featured: true });
    assert.equal(flag.status, 200);
    assert.equal(flag.body.property.featured, true);

    // Customer sends inquiry -> landlord /inquiries and /stats reflect it
    const inq = await call(customer, "post", "/inquiries", {
      propertyId: propId, name: "Customer", phone: "01740000001", message: "Is parking included in the rent?"
    });
    assert.equal(inq.status, 201);
    const lInqs = await call(landlord, "get", "/landlord/inquiries");
    assert.equal(lInqs.status, 200);
    assert.equal(lInqs.body.total, 1);
    assert.equal(lInqs.body.items[0].propertyTitle, "Admin Review Flat in Bashundhara");
    const lStats = await call(landlord, "get", "/landlord/stats");
    assert.equal(lStats.body.inquiries, 1);

    // Verify pending landlord user
    const verifyUser = await call(admin, "patch", `/admin/users/${landlordId}/status`, { status: "active", note: "NID verified" });
    assert.equal(verifyUser.status, 200);
    assert.equal(verifyUser.body.user.status, "active");

    // Admin cannot change own status (409)
    assert.equal((await call(admin, "patch", `/admin/users/${adminId}/status`, { status: "suspended" })).status, 409);

    // Moderation history records all admin actions
    const hist = await call(admin, "get", "/admin/moderation-history");
    assert.equal(hist.status, 200);
    assert.ok(hist.body.items.length >= 4);
    const actions = hist.body.items.map(i => i.action);
    assert.ok(actions.includes("property_approved"));
    assert.ok(actions.includes("property_flags_updated"));
    assert.ok(actions.includes("user_status_changed"));
    assert.ok(actions.includes("report_status_changed"));
  });
});
