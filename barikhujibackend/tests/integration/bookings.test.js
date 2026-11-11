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
const futureDate = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe("booking system & automatic property visibility (integration)", { skip }, () => {
  let app, User, Property, Booking, ModerationLog;
  let landlordA, landlordB, customer1, customer2, admin;
  let propDoc;

  async function signIn(portal, email) {
    const ag = supertest.agent(app);
    const csrf0 = (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const r = await ag.post(`${API}/auth/${portal}/login`).set("Origin", ORIGIN).set("X-CSRF-Token", csrf0).send({ email, password: PASSWORD });
    assert.equal(r.status, 200, `login failed for ${email}`);
    return { ag, csrf: r.body.csrfToken };
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
    Booking = require("../../models/Booking");
    ModerationLog = require("../../models/ModerationLog");

    const config = loadConfig({
      NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4",
      RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000", RATE_LIMIT_REGISTER_MAX: "1000"
    });
    await connectDb(config.mongoUri);
    try { await Booking.collection.dropIndexes(); } catch (_) {}
    await Promise.all([User.init(), Property.init(), Booking.init(), ModerationLog.init()]);
    await Promise.all([User.deleteMany({}), Property.deleteMany({}), Booking.deleteMany({}), ModerationLog.deleteMany({}), mongoose.connection.collection("sessions").deleteMany({})]);
    app = createApp(config);

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const [uLA, uLB] = await User.create([
      { name: "Booking Landlord A", email: "bk.landlord.a@example.com", phone: "01720000001", passwordHash, role: "landlord", status: "active" },
      { name: "Booking Landlord B", email: "bk.landlord.b@example.com", phone: "01720000002", passwordHash, role: "landlord", status: "active" },
      { name: "Booking Customer 1", email: "bk.cust.1@example.com", phone: "01820000001", passwordHash, role: "customer", status: "active" },
      { name: "Booking Customer 2", email: "bk.cust.2@example.com", phone: "01820000002", passwordHash, role: "customer", status: "active" },
      { name: "Booking Admin", email: "bk.admin@example.com", phone: "01920000001", passwordHash, role: "admin", status: "active" }
    ]);
    landlordA = await signIn("landlord", "bk.landlord.a@example.com");
    landlordB = await signIn("landlord", "bk.landlord.b@example.com");
    customer1 = await signIn("customer", "bk.cust.1@example.com");
    customer2 = await signIn("customer", "bk.cust.2@example.com");
    admin = await signIn("admin", "bk.admin@example.com");

    propDoc = await Property.create({
      landlord: uLA._id,
      title: "Confirmed Visibility Test Apartment in Banani",
      description: "Spacious modern apartment ideal for bachelors or small families near Banani Road 11.",
      type: "Apartment",
      furnished: "Furnished",
      city: "Dhaka",
      area: "Banani",
      address: "Road 11, Block F",
      rent: 35000,
      deposit: 70000,
      bedrooms: 2,
      bathrooms: 2,
      availableFrom: futureDate(1),
      suitableFor: ["Family", "Bachelor"],
      amenities: ["Lift", "Gas"],
      images: ["https://images.example.com/banani.jpg"],
      status: "active",
      verified: true,
      featured: true
    });
    assert.ok(uLB);
  });

  after(async () => {
    await Promise.all([User.deleteMany({}), Property.deleteMany({}), Booking.deleteMany({}), ModerationLog.deleteMany({}), mongoose.connection.collection("sessions").deleteMany({})]);
    await mongoose.disconnect();
  });

  test("validates booking dates and authorization", async () => {
    // Anonymous rejected (reads -> 401, writes after CSRF -> 401)
    const anon = supertest.agent(app);
    assert.equal((await anon.get(`${API}/me/bookings`).set("Origin", ORIGIN)).status, 401);
    const anonCsrf = (await anon.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    assert.equal((await anon.post(`${API}/bookings`).set("Origin", ORIGIN).set("X-CSRF-Token", anonCsrf).send({})).status, 401);
    // Landlord cannot call customer booking endpoint
    assert.equal((await call(landlordA, "post", "/bookings", { propertyId: String(propDoc._id), moveInDate: futureDate(5) })).status, 403);
    // Past date rejected
    assert.equal((await call(customer1, "post", "/bookings", { propertyId: String(propDoc._id), moveInDate: "2020-01-01" })).status, 422);
    // moveOutDate <= moveInDate rejected
    assert.equal((await call(customer1, "post", "/bookings", { propertyId: String(propDoc._id), moveInDate: futureDate(10), moveOutDate: futureDate(5) })).status, 422);
  });

  test("pending booking keeps property visible; confirming hides it from ALL public endpoints while preserving landlord/admin access", async () => {
    const b1Res = await call(customer1, "post", "/bookings", {
      propertyId: String(propDoc._id), moveInDate: futureDate(5), moveOutDate: futureDate(95), message: "Interested in moving in next week."
    });
    assert.equal(b1Res.status, 201, JSON.stringify(b1Res.body));
    const b1Id = b1Res.body.booking.id;

    // Duplicate pending request by same customer is blocked (409)
    const dup = await call(customer1, "post", "/bookings", { propertyId: String(propDoc._id), moveInDate: futureDate(6) });
    assert.equal(dup.status, 409);

    // Another customer can still submit a pending request while property is active
    const b2Res = await call(customer2, "post", "/bookings", { propertyId: String(propDoc._id), moveInDate: futureDate(7) });
    assert.equal(b2Res.status, 201);
    const b2Id = b2Res.body.booking.id;

    // Property MUST STILL be publicly visible while bookings are only pending
    assert.equal((await supertest(app).get(`${API}/properties/${propDoc._id}`)).status, 200);
    assert.equal((await supertest(app).get(`${API}/properties?location=banani`)).body.total, 1);

    // Pending -> customer can view contact phone; anonymous cannot (401)
    assert.equal((await supertest(app).get(`${API}/properties/${propDoc._id}/contact`)).status, 401);
    const contactActive = await call(customer1, "get", `/properties/${propDoc._id}/contact`);
    assert.equal(contactActive.status, 200);
    assert.equal(contactActive.body.phone, "01720000001");

    // Landlord B cannot confirm Landlord A's booking (404)
    assert.equal((await call(landlordB, "post", `/landlord/bookings/${b1Id}/confirm`)).status, 404);

    // Landlord A confirms Booking 1
    const confirm = await call(landlordA, "post", `/landlord/bookings/${b1Id}/confirm`);
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    assert.equal(confirm.body.booking.status, "confirmed");
    assert.equal(confirm.body.propertyStatus, "booked");

    // 1. Property still exists in MongoDB with images/details preserved
    const dbProp = await Property.findById(propDoc._id);
    assert.ok(dbProp);
    assert.equal(dbProp.status, "booked");
    assert.deepEqual([...dbProp.images], ["https://images.example.com/banani.jpg"]);

    // 2. Public endpoints MUST NOT expose it
    assert.equal((await supertest(app).get(`${API}/properties`)).body.total, 0);
    assert.equal((await supertest(app).get(`${API}/properties?location=banani`)).body.total, 0);
    assert.equal((await supertest(app).get(`${API}/properties?featured=1`)).body.total, 0);
    assert.equal((await supertest(app).get(`${API}/properties?suitableFor=Bachelor`)).body.total, 0);
    assert.equal((await supertest(app).get(`${API}/locations?q=banani`)).body.items.length, 0);
    assert.equal((await supertest(app).get(`${API}/properties/${propDoc._id}`)).status, 404);
    assert.equal((await call(customer1, "get", `/properties/${propDoc._id}/contact`)).status, 404);

    // 3. Landlord STILL sees property in dashboard & cannot edit/delete/toggle while booked
    const lList = await call(landlordA, "get", "/landlord/properties");
    assert.equal(lList.status, 200);
    assert.equal(lList.body[0].status, "booked");
    assert.equal((await call(landlordA, "get", `/landlord/properties/${propDoc._id}`)).status, 200);
    assert.equal((await call(landlordA, "patch", `/landlord/properties/${propDoc._id}/status`, { status: "active" })).status, 409);
    assert.equal((await call(landlordA, "delete", `/landlord/properties/${propDoc._id}`)).status, 409);

    // 4. Admin STILL accesses the booked property & booking
    const admProps = await call(admin, "get", "/admin/properties?status=booked");
    assert.equal(admProps.status, 200);
    assert.equal(admProps.body.items.length, 1);
    assert.equal(admProps.body.items[0].id, String(propDoc._id));
    assert.equal((await call(admin, "get", `/admin/properties/${propDoc._id}`)).status, 200);
    assert.equal((await call(admin, "get", "/admin/bookings?status=confirmed")).body.items.length, 1);

    // 5. Double-booking prevention: Landlord A CANNOT confirm Booking 2 while Booking 1 is confirmed
    const doubleConfirm = await call(landlordA, "post", `/landlord/bookings/${b2Id}/confirm`);
    assert.equal(doubleConfirm.status, 409);

    // 6. Rejecting Booking 2 keeps history and leaves property booked
    const rej = await call(landlordA, "post", `/landlord/bookings/${b2Id}/reject`, { reason: "Already rented" });
    assert.equal(rej.status, 200);
    assert.equal(rej.body.booking.status, "rejected");

    // 7. Cancelling confirmed Booking 1 restores public availability and preserves full history
    const cancel = await call(customer1, "post", `/me/bookings/${b1Id}/cancel`);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.booking.status, "cancelled");
    assert.equal(cancel.body.booking.history.length >= 3, true);

    assert.equal((await Property.findById(propDoc._id)).status, "active");
    assert.equal((await supertest(app).get(`${API}/properties/${propDoc._id}`)).status, 200);
    assert.equal((await supertest(app).get(`${API}/properties?location=banani`)).body.total, 1);
  });
});
