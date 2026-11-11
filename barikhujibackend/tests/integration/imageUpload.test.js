"use strict";
const fs = require("fs");
const path = require("path");
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
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0]);
const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);

describe("property multipart image upload (integration)", { skip }, () => {
  let app, User, Property, landlordSession;
  const createdFiles = new Set();

  function trackImages(images = []) {
    const { UPLOAD_ROOT } = require("../../utils/uploadImages");
    for (const u of images) {
      if (typeof u === "string" && u.startsWith("/uploads/")) {
        createdFiles.add(path.join(UPLOAD_ROOT, u.replace(/^\/uploads\//, "")));
      }
    }
  }

  function attachListingFields(req, over = {}) {
    const fields = {
      title: "Multipart Upload Apartment in Dhanmondi",
      description: "Bright spacious flat near Dhanmondi lake with lift and backup power.",
      type: "Apartment",
      furnished: "Furnished",
      city: "Dhaka",
      area: "Dhanmondi",
      rent: "25000",
      deposit: "50000",
      bedrooms: "2",
      bathrooms: "2",
      availableFrom: today,
      suitableFor: "Family",
      ...over
    };
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) v.forEach(item => req.field(k, item));
      else if (v !== undefined) req.field(k, String(v));
    }
    return req;
  }

  before(async () => {
    const { loadConfig } = require("../../config/env");
    const { connectDb } = require("../../config/db");
    const { createApp } = require("../../app");
    User = require("../../models/User");
    Property = require("../../models/Property");

    const config = loadConfig({
      NODE_ENV: "test", MONGODB_URI: TEST_URI, FRONTEND_ORIGIN: ORIGIN, BCRYPT_ROUNDS: "4",
      RATE_LIMIT_LOGIN_IP_MAX: "1000", RATE_LIMIT_LOGIN_EMAIL_MAX: "1000", RATE_LIMIT_REGISTER_MAX: "1000"
    });
    await connectDb(config.mongoUri);
    await Promise.all([User.init(), Property.init()]);
    await Promise.all([User.deleteMany({}), Property.deleteMany({}), mongoose.connection.collection("sessions").deleteMany({})]);
    app = createApp(config);

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await User.create({ name: "Upload Landlord", email: "upload.landlord@example.com", phone: "01710000001", passwordHash, role: "landlord", status: "active" });

    const ag = supertest.agent(app);
    const csrf0 = (await ag.get(`${API}/auth/csrf`).set("Origin", ORIGIN)).body.csrfToken;
    const login = await ag.post(`${API}/auth/landlord/login`).set("Origin", ORIGIN).set("X-CSRF-Token", csrf0).send({ email: "upload.landlord@example.com", password: PASSWORD });
    assert.equal(login.status, 200);
    landlordSession = { ag, csrf: login.body.csrfToken };
  });

  after(async () => {
    for (const f of createdFiles) {
      await fs.promises.unlink(f).catch(() => {});
    }
    await Promise.all([User.deleteMany({}), Property.deleteMany({}), mongoose.connection.collection("sessions").deleteMany({})]);
    await mongoose.disconnect();
  });

  test("uploads JPEG, PNG, WebP (up to 10 images), serves them with cross-origin policy, and blocks 11th", async () => {
    const req10 = attachListingFields(
      landlordSession.ag.post(`${API}/landlord/properties`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf),
      { suitableFor: ["Family", "Bachelor"], amenities: ["Lift", "Gas"] }
    );
    for (let i = 0; i < 4; i++) req10.attach("images", JPG_BYTES, { filename: `j${i}.jpg`, contentType: "image/jpeg" });
    for (let i = 0; i < 3; i++) req10.attach("images", PNG_BYTES, { filename: `p${i}.png`, contentType: "image/png" });
    for (let i = 0; i < 3; i++) req10.attach("images", WEBP_BYTES, { filename: `w${i}.webp`, contentType: "image/webp" });

    const r10 = await req10;
    assert.equal(r10.status, 201, JSON.stringify(r10.body));
    assert.equal(r10.body.images.length, 10);
    trackImages(r10.body.images);
    for (const u of r10.body.images) assert.match(u, /^\/uploads\/properties\/[0-9a-f-]+\.(jpg|png|webp)$/);

    // Verify uploaded file is served cleanly over HTTP with cross-origin policy header.
    const imgRes = await supertest(app).get(r10.body.images[0]);
    assert.equal(imgRes.status, 200);
    assert.equal(imgRes.headers["cross-origin-resource-policy"], "cross-origin");

    // 11 images must fail with 422.
    const req11 = attachListingFields(
      landlordSession.ag.post(`${API}/landlord/properties`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf)
    );
    for (let i = 0; i < 11; i++) req11.attach("images", JPG_BYTES, { filename: `x${i}.jpg`, contentType: "image/jpeg" });
    const r11 = await req11;
    assert.equal(r11.status, 422);
    assert.match(r11.body.message, /10/);
  });

  test("rejects spoofed malicious uploads (HTML disguised as JPEG) without creating a listing", async () => {
    const before = await Property.countDocuments();
    const reqBad = attachListingFields(
      landlordSession.ag.post(`${API}/landlord/properties`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf)
    );
    reqBad.attach("images", Buffer.from("<html><script>alert(1)</script></html>"), { filename: "evil.jpg", contentType: "image/jpeg" });
    const r = await reqBad;
    assert.equal(r.status, 422);
    assert.match(r.body.message, /valid JPG, PNG or WebP/i);
    assert.equal(await Property.countDocuments(), before);
  });

  test("editing keeps selected existing images, adds new ones up to 10, preserves on unrelated edit, and cleans up removed files", async () => {
    const createReq = attachListingFields(
      landlordSession.ag.post(`${API}/landlord/properties`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf)
    );
    createReq.attach("images", JPG_BYTES, { filename: "a.jpg", contentType: "image/jpeg" });
    createReq.attach("images", PNG_BYTES, { filename: "b.png", contentType: "image/png" });
    const created = await createReq;
    assert.equal(created.status, 201);
    const [imgA, imgB] = created.body.images;
    trackImages(created.body.images);

    // Unrelated edit (multipart without keepExistingImages or files) preserves both existing images.
    const unrelated = await attachListingFields(
      landlordSession.ag.put(`${API}/landlord/properties/${created.body.id}`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf),
      { rent: "26000" }
    );
    assert.equal(unrelated.status, 200);
    assert.deepEqual(unrelated.body.images, [imgA, imgB]);

    // Remove imgB, keep imgA, and add 1 new WebP image.
    const editImgs = attachListingFields(
      landlordSession.ag.put(`${API}/landlord/properties/${created.body.id}`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf),
      { rent: "26000", keepExistingImages: "1", existingImages: imgA }
    );
    editImgs.attach("images", WEBP_BYTES, { filename: "c.webp", contentType: "image/webp" });
    const updated = await editImgs;
    assert.equal(updated.status, 200);
    trackImages(updated.body.images);
    assert.equal(updated.body.images.length, 2);
    assert.equal(updated.body.images[0], imgA);
    assert.match(updated.body.images[1], /\.webp$/);

    // imgB should be cleaned up from disk since nothing references it.
    const { UPLOAD_ROOT } = require("../../utils/uploadImages");
    assert.equal(fs.existsSync(path.join(UPLOAD_ROOT, imgB.replace(/^\/uploads\//, ""))), false);

    // Deleting the property cleans up the remaining uploaded images.
    const del = await landlordSession.ag.delete(`${API}/landlord/properties/${created.body.id}`).set("Origin", ORIGIN).set("X-CSRF-Token", landlordSession.csrf);
    assert.equal(del.status, 204);
    for (const u of updated.body.images) {
      assert.equal(fs.existsSync(path.join(UPLOAD_ROOT, u.replace(/^\/uploads\//, ""))), false);
    }
  });
});
