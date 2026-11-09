"use strict";
// Full HTTP + MongoDB tests for GET /api/v1/properties and /api/v1/properties/:id. They run ONLY when TEST_MONGODB_URI is set
// and its database name contains "test" (they delete every user, listing and session in that database). Otherwise they are skipped.
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
const LANDLORD_EMAIL = "public.landlord@example.com", LANDLORD_PHONE = "01755555555", SECRET_ADDRESS = "Secret Lane 12, Block Q";
const today = new Date().toISOString().slice(0, 10);

describe("public property API (integration)", { skip }, () => {
  let app, Property, User, landlord, byTitle = {};
  const get = (path) => supertest(app).get(`${API}${path}`);
  const titles = r => r.body.items.map(i => i.title);

  // Direct inserts so every status and field combination can be set up. createdAt is forced through the driver for the "newest" tests.
  async function seed(title, over = {}, createdAtMs) {
    const p = await Property.create({
      landlord: landlord._id, title, description: `${title} - a comfortable place with everything you need nearby.`, type: "Apartment", furnished: "Furnished",
      city: "Dhaka", area: "Dhanmondi", address: SECRET_ADDRESS, rent: 20000, deposit: 40000, bedrooms: 2, bathrooms: 2, availableFrom: today,
      suitableFor: ["Family"], amenities: [], images: ["https://images.example.com/x.jpg"], status: "active", ...over
    });
    if (createdAtMs) await Property.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(createdAtMs) } });
    byTitle[title] = p; return p;
  }

  before(async () => {
    const { loadConfig } = require("../../config/env");
    const { connectDb } = require("../../config/db");
    const { createApp } = require("../../app");
    User = require("../../models/User"); Property = require("../../models/Property");
    const config = loadConfig({ NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4", RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000" });
    await connectDb(config.mongoUri);
    await User.init(); await Property.init();
    for (const M of [User, Property]) await M.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    app = createApp(config);

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    [landlord] = await User.create([{ name: "Mr. Rahman", email: LANDLORD_EMAIL, phone: LANDLORD_PHONE, passwordHash, role: "landlord", status: "active" }]);
    const t0 = Date.parse("2026-01-01T00:00:00Z");
    await seed("Dhanmondi Family Flat", { rent: 28000, bedrooms: 3, bathrooms: 2, featured: true, suitableFor: ["Family"], amenities: ["Lift", "Generator", "Gas"], furnished: "Semi-furnished" }, t0 + 1000);
    await seed("Mirpur Bachelor Room", { area: "Mirpur", type: "Room", rent: 9000, bedrooms: 1, bathrooms: 1, suitableFor: ["Bachelor", "Student"], amenities: ["Wi-Fi", "Security"], availableFrom: "2020-01-15" }, t0 + 2000);
    await seed("Gulshan Luxury Apartment", { area: "Gulshan", rent: 65000, bedrooms: 3, bathrooms: 3, featured: true, amenities: ["Lift", "Parking", "CCTV"], availableFrom: "2099-02-01" }, t0 + 3000);
    await seed("Panchlaish Hill Flat", { area: "Panchlaish", city: "Chattogram", rent: 18000, furnished: "Unfurnished", suitableFor: ["Family", "Bachelor"], amenities: ["Lift", "Gas"] }, t0 + 4000);
    await seed("Uttara Studio Nest", { area: "Uttara", type: "Studio", rent: 15000, bedrooms: 1, bathrooms: 1, suitableFor: ["Bachelor"], amenities: ["Wi-Fi", "Lift"] }, t0 + 5000);
    await seed("Shahbag Mess Seat", { area: "Shahbag", type: "Mess/Seat", rent: 4500, bedrooms: 1, bathrooms: 1, suitableFor: ["Student", "Bachelor"], amenities: ["Wi-Fi"], furnished: "Furnished" }, t0 + 6000);
    // Never public:
    await seed("HIDDEN pending listing", { status: "pending_review" }, t0 + 7000);
    await seed("HIDDEN paused listing", { status: "paused" }, t0 + 8000);
    await seed("HIDDEN rejected listing", { status: "rejected" }, t0 + 9000);
  });
  after(async () => {
    for (const M of [User, Property]) await M.deleteMany({});
    await mongoose.connection.collection("sessions").deleteMany({});
    await mongoose.disconnect();
  });

  // ---------- visibility ----------
  test("anonymous visitors can list; only active listings appear and no session cookie is created", async () => {
    const r = await get("/properties");
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 6); assert.equal(r.body.items.length, 6);
    assert.equal(titles(r).some(t => t.startsWith("HIDDEN")), false);
    assert.equal(r.headers["set-cookie"], undefined);
  });
  test("response format is { items, total, page, pages }", async () => {
    const r = await get("/properties");
    assert.deepEqual(Object.keys(r.body).sort(), ["items", "page", "pages", "total"]);
    assert.deepEqual([r.body.page, r.body.pages], [1, 1]);
  });
  test("details: active listing is 200; pending, paused, rejected, unknown and malformed ids are all the same 404", async () => {
    assert.equal((await get(`/properties/${byTitle["Dhanmondi Family Flat"]._id}`)).status, 200);
    for (const t of ["HIDDEN pending listing", "HIDDEN paused listing", "HIDDEN rejected listing"]) {
      const r = await get(`/properties/${byTitle[t]._id}`);
      assert.equal(r.status, 404, t); assert.equal(r.body.message, "Property not found.");
    }
    for (const id of ["507f1f77bcf86cd799439011", "not-an-id", "123", "%7B%24ne%3A1%7D"]) assert.equal((await get(`/properties/${id}`)).status, 404, id);
  });

  // ---------- privacy and shape ----------
  test("items have exactly the public fields js/api.js expects", async () => {
    const r = await get(`/properties/${byTitle["Dhanmondi Family Flat"]._id}`);
    assert.deepEqual(Object.keys(r.body).sort(), ["amenities", "area", "availableFrom", "bathrooms", "bedrooms", "city", "deposit", "description", "featured", "furnished", "id", "images", "landlord", "rent", "suitableFor", "title", "type", "verified"]);
    assert.equal(r.body.id, String(byTitle["Dhanmondi Family Flat"]._id));
    assert.deepEqual(r.body.landlord, { name: "Mr. Rahman", verified: true });
    assert.equal(typeof r.body.rent, "number"); assert.ok(Array.isArray(r.body.suitableFor)); assert.match(r.body.availableFrom, /^\d{4}-\d{2}-\d{2}$/);
  });
  test("no private landlord or listing data leaks, in the list or the details", async () => {
    const bodies = [JSON.stringify((await get("/properties")).body), JSON.stringify((await get(`/properties/${byTitle["Mirpur Bachelor Room"]._id}`)).body)];
    for (const text of bodies) for (const secret of [LANDLORD_EMAIL, LANDLORD_PHONE, SECRET_ADDRESS, String(landlord._id), "passwordHash", "reviewedBy", "pending_verification", "\"status\"", "\"views\"", "createdAt"]) assert.equal(text.includes(secret), false, secret);
  });
  test("a landlord whose account is still pending_verification shows as not verified", async () => {
    await User.updateOne({ _id: landlord._id }, { status: "pending_verification" });
    assert.equal((await get(`/properties/${byTitle["Dhanmondi Family Flat"]._id}`)).body.landlord.verified, false);
    await User.updateOne({ _id: landlord._id }, { status: "active" });
  });

  // ---------- filters ----------
  test("location: matches area or city, case-insensitively, several words together", async () => {
    assert.deepEqual(titles(await get("/properties?location=dhanmondi")), ["Dhanmondi Family Flat"]);
    assert.equal((await get("/properties?location=DHAKA")).body.total, 5);
    assert.deepEqual(titles(await get("/properties?location=chattogram")), ["Panchlaish Hill Flat"]);
    assert.deepEqual(titles(await get("/properties?location=" + encodeURIComponent("Mirpur, Dhaka"))), ["Mirpur Bachelor Room"]);
    assert.equal((await get("/properties?location=Mirpur%20Chattogram")).body.total, 0);
  });
  test("location is escaped: regex characters are plain text and never match everything", async () => {
    for (const evil of [".*", "(a%2B)%2B%24", "%5E", "%5Ba-z%5D", "a%7Cb"]) {
      const r = await get(`/properties?location=${evil}`);
      assert.equal(r.status, 200, evil); assert.equal(r.body.total, 0, evil);
    }
  });
  test("rent range, including edges", async () => {
    assert.deepEqual(titles(await get("/properties?minRent=15000&maxRent=20000&sort=rentAsc")), ["Uttara Studio Nest", "Panchlaish Hill Flat"]);
    assert.equal((await get("/properties?maxRent=4500")).body.total, 1);
    assert.equal((await get("/properties?minRent=65000")).body.total, 1);
  });
  test("type, suitableFor (bachelor), furnished", async () => {
    assert.deepEqual(titles(await get("/properties?type=Room")), ["Mirpur Bachelor Room"]);
    assert.equal((await get("/properties?type=mess%2Fseat")).body.total, 1);
    const bachelor = await get("/properties?suitableFor=Bachelor&sort=rentAsc");
    assert.deepEqual(titles(bachelor), ["Shahbag Mess Seat", "Mirpur Bachelor Room", "Uttara Studio Nest", "Panchlaish Hill Flat"]);
    assert.equal((await get("/properties?suitableFor=bachelor")).body.total, 4);
    assert.deepEqual(titles(await get("/properties?furnished=Unfurnished")), ["Panchlaish Hill Flat"]);
  });
  test("bedrooms and bathrooms mean 'at least'", async () => {
    assert.equal((await get("/properties?bedrooms=3")).body.total, 2);
    assert.equal((await get("/properties?bedrooms=2")).body.total, 3);
    assert.equal((await get("/properties?bathrooms=3")).body.total, 1);
  });
  test("availableFrom means 'free on or before that date'", async () => {
    assert.equal((await get("/properties?availableFrom=2020-01-15")).body.total, 1);
    assert.equal((await get(`/properties?availableFrom=${today}`)).body.total, 5);
    assert.equal((await get("/properties?availableFrom=2099-12-31")).body.total, 6);
  });
  test("amenities: the listing must have all of them", async () => {
    assert.deepEqual(titles(await get("/properties?amenities=Lift,Gas&sort=rentAsc")), ["Panchlaish Hill Flat", "Dhanmondi Family Flat"]);
    assert.equal((await get("/properties?amenities=wi-fi")).body.total, 3);
    assert.equal((await get("/properties?amenities=Lift,Wi-Fi")).body.total, 1);
  });
  test("featured=1 filters; featured=0 does not", async () => {
    assert.equal((await get("/properties?featured=1")).body.total, 2);
    assert.equal((await get("/properties?featured=0")).body.total, 6);
  });
  test("blank filters from the browse form and unknown parameters are ignored", async () => {
    const r = await get("/properties?location=&minRent=&maxRent=&type=&suitableFor=&bedrooms=&bathrooms=&furnished=&availableFrom=&amenities=&sort=&foo=bar&status=paused");
    assert.equal(r.status, 200); assert.equal(r.body.total, 6);
  });

  // ---------- sorting and paging ----------
  test("sorting: rentAsc, rentDesc, newest, and featured-first by default", async () => {
    assert.deepEqual((await get("/properties?sort=rentAsc")).body.items.map(i => i.rent), [4500, 9000, 15000, 18000, 28000, 65000]);
    assert.deepEqual((await get("/properties?sort=rentDesc")).body.items.map(i => i.rent), [65000, 28000, 18000, 15000, 9000, 4500]);
    assert.equal(titles(await get("/properties?sort=newest"))[0], "Shahbag Mess Seat");
    const def = (await get("/properties")).body.items;
    assert.deepEqual(def.slice(0, 2).map(i => i.featured), [true, true]);
  });
  test("pagination: metadata, no duplicates, no gaps, and out-of-range pages are empty", async () => {
    const seen = [];
    for (const page of [1, 2, 3]) {
      const r = await get(`/properties?limit=2&page=${page}&sort=rentAsc`);
      assert.deepEqual([r.body.total, r.body.pages, r.body.page, r.body.items.length], [6, 3, page, 2]); seen.push(...titles(r));
    }
    assert.equal(new Set(seen).size, 6);
    const past = await get("/properties?limit=2&page=9");
    assert.deepEqual([past.status, past.body.items.length, past.body.total, past.body.page], [200, 0, 6, 9]);
    assert.equal((await get("/properties?limit=4")).body.pages, 2);
  });
  test("a filter with no match returns an empty list, not an error", async () => {
    assert.equal((await get("/properties?minRent=999999")).status, 200);
    assert.deepEqual((await get("/properties?minRent=999999")).body, { items: [], total: 0, page: 1, pages: 1 });
  });

  // ---------- validation and injection ----------
  test("invalid values get 422 with a clear message", async () => {
    for (const [qs, re] of [["minRent=abc", /Minimum rent/], ["minRent=9000&maxRent=5000", /cannot be higher/], ["type=Castle", /Type/], ["suitableFor=Everyone", /Suitable/],
      ["bedrooms=99", /Bedrooms/], ["availableFrom=2026-02-30", /date/i], ["amenities=Jacuzzi", /Amenities/], ["featured=maybe", /Featured/], ["sort=price", /Sort/],
      ["page=0", /Page/], ["page=abc", /Page/], ["limit=0", /Limit/], ["limit=51", /Limit/], ["limit=-3", /Limit/]]) {
      const r = await get(`/properties?${qs}`);
      assert.equal(r.status, 422, qs); assert.match(r.body.message, re, qs);
    }
  });
  test("query-string injection is rejected, not executed", async () => {
    for (const qs of ["type[$ne]=Room", "location[$regex]=.*", "amenities[$gt]=", "suitableFor[$in][]=Family", "type=Room&type=Studio", "status=paused", "sort[$natural]=1"]) {
      const r = await get(`/properties?${qs}`);
      assert.ok([200, 422].includes(r.status), qs);
      if (r.status === 200) assert.equal(titles(r).some(t => t.startsWith("HIDDEN")), false, qs);
    }
    assert.equal((await get("/properties?type[$ne]=Room")).status, 422);
    assert.equal((await get("/properties?status=paused")).body.total, 6);
  });

  // ---------- side effects ----------
  test("opening a listing adds one view and leaves updatedAt alone", async () => {
    const id = byTitle["Uttara Studio Nest"]._id;
    const before = await Property.findById(id);
    assert.equal((await get(`/properties/${id}`)).status, 200);
    const after = await Property.findById(id);
    assert.equal(after.views, before.views + 1);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    await get("/properties");                                    // listing does not count as a view
    assert.equal((await Property.findById(id)).views, before.views + 1);
  });

  // ---------- end to end with the landlord API ----------
  test("a listing is public only while it is active: create -> approve -> pause -> resume -> edit", async () => {
    const A = supertest.agent(app);
    const tok0 = (await A.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const login = await A.post(`${API}/auth/landlord/login`).set("Origin", ORIGIN).set("X-CSRF-Token", tok0).send({ email: LANDLORD_EMAIL, password: PASSWORD });
    assert.equal(login.status, 200);
    const send = (method, path, body) => A[method](`${API}${path}`).set("Origin", ORIGIN).set("X-CSRF-Token", login.body.csrfToken).send(body);
    const listing = { title: "End To End Flat in Banani", description: "A bright and quiet flat close to shops, schools and public transport.", type: "Apartment", furnished: "Furnished",
      city: "Dhaka", area: "Banani", rent: 33000, deposit: 66000, bedrooms: 2, bathrooms: 2, availableFrom: today, suitableFor: ["Family"] };

    const created = await send("post", "/landlord/properties", listing);
    assert.equal(created.status, 201); const id = created.body.id;
    assert.equal((await get(`/properties/${id}`)).status, 404);                                  // pending: not public
    assert.equal(titles(await get("/properties?location=banani")).length, 0);

    await Property.updateOne({ _id: id }, { status: "active", reviewedAt: new Date() });          // stands in for the admin API
    assert.equal((await get(`/properties/${id}`)).status, 200);                                  // approved: public
    assert.deepEqual(titles(await get("/properties?location=banani")), ["End To End Flat in Banani"]);

    assert.equal((await send("patch", `/landlord/properties/${id}/status`, { status: "paused" })).status, 200);
    assert.equal((await get(`/properties/${id}`)).status, 404);                                  // paused: hidden again
    assert.equal((await send("patch", `/landlord/properties/${id}/status`, { status: "active" })).status, 200);
    assert.equal((await get(`/properties/${id}`)).status, 200);

    assert.equal((await send("put", `/landlord/properties/${id}`, { ...listing, rent: 35000 })).body.status, "pending_review");
    assert.equal((await get(`/properties/${id}`)).status, 404);                                  // edited: back in review, hidden
  });
});
