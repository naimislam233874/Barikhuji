"use strict";
// Runs the REAL public controller against a fake model (no database, no mongoose needed).
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const createPropertyController = require("../../controllers/propertyController");

const ID = "507f1f77bcf86cd799439011";
const row = (over = {}) => ({ _id: ID, title: "Sunny 2-Bed Flat near Dhanmondi Lake", area: "Dhanmondi", city: "Dhaka", rent: 28000, deposit: 56000, type: "Apartment", bedrooms: 2, bathrooms: 2,
  furnished: "Furnished", suitableFor: ["Bachelor"], amenities: [], availableFrom: "2026-11-01", verified: false, featured: false, images: [], description: "d".repeat(40),
  landlord: { _id: "507f1f77bcf86cd799439022", name: "Mr. Rahman", status: "active" }, status: "active", ...over });

function fakeModel({ docs = [row()], total = docs.length, failViews = false } = {}) {
  const calls = {};
  const chain = result => { const c = {}; for (const m of ["select", "sort", "skip", "limit", "populate", "lean"]) c[m] = (...a) => { (calls[m] = calls[m] || []).push(a); return c; }; c.then = (ok, bad) => Promise.resolve(result()).then(ok, bad); return c; };
  return { calls,
    find(filter) { calls.find = filter; return chain(() => docs); },
    countDocuments(filter) { calls.count = filter; return Promise.resolve(total); },
    findOne(filter) { calls.findOne = filter; return chain(() => (filter.status === "active" ? docs.find(d => String(d._id) === String(filter._id) && d.status === "active") || null : null)); },
    updateOne(...a) { calls.updateOne = a; return failViews ? Promise.reject(new Error("db down")) : Promise.resolve({}); } };
}
const call = (handler, req) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  handler({ query: {}, params: {}, ...req }, res, reject);
});

describe("GET /properties (controller)", () => {
  test("returns { items, total, page, pages } in the public shape", async () => {
    const m = fakeModel({ docs: [row(), row({ _id: "507f1f77bcf86cd799439012" })], total: 25 });
    const r = await call(createPropertyController(m).list, { query: { limit: "10", page: "2" } });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.total, r.body.page, r.body.pages, r.body.items.length], [25, 2, 3, 2]);
    assert.equal("address" in r.body.items[0], false); assert.equal(r.body.items[0].landlord.name, "Mr. Rahman");
  });
  test("always filters on status active, and loads only public fields and the landlord's name and status", async () => {
    const m = fakeModel();
    await call(createPropertyController(m).list, { query: { status: "pending_review", type: "Room" } });
    assert.equal(m.calls.find.status, "active"); assert.equal(m.calls.count.status, "active"); assert.equal(m.calls.find.type, "Room");
    assert.ok(!m.calls.select[0][0].includes("address")); assert.deepEqual(m.calls.populate[0][0], { path: "landlord", select: "name status" });
  });
  test("paging maps to skip and limit; pages is at least 1 even with no results", async () => {
    const m = fakeModel({ docs: [], total: 0 });
    const r = await call(createPropertyController(m).list, { query: { page: "3", limit: "5" } });
    assert.deepEqual([m.calls.skip[0][0], m.calls.limit[0][0]], [10, 5]);
    assert.deepEqual([r.body.items, r.body.total, r.body.pages, r.body.page], [[], 0, 1, 3]);
  });
  test("invalid parameters get 422 and the database is never queried", async () => {
    const m = fakeModel();
    const r = await call(createPropertyController(m).list, { query: { minRent: "abc", sort: "hack" } });
    assert.equal(r.status, 422); assert.match(r.body.message, /Minimum rent/); assert.ok(r.body.errors.sort);
    assert.equal(m.calls.find, undefined);
  });
  test("injection-style parameters never reach the database", async () => {
    const m = fakeModel();
    const r = await call(createPropertyController(m).list, { query: { type: { $ne: "Room" }, location: { $regex: ".*" } } });
    assert.equal(r.status, 422); assert.equal(m.calls.find, undefined);
  });
});

describe("GET /properties/:id (controller)", () => {
  test("an active listing is returned in the public shape and its view counter goes up without touching updatedAt", async () => {
    const m = fakeModel();
    const r = await call(createPropertyController(m).get, { params: { id: ID } });
    assert.equal(r.status, 200); assert.equal(r.body.id, ID); assert.equal(r.body.landlord.verified, true);
    assert.deepEqual(m.calls.findOne, { _id: ID, status: "active" });
    assert.deepEqual(m.calls.updateOne, [{ _id: ID, status: "active" }, { $inc: { views: 1 } }, { timestamps: false }]);
  });
  test("pending, paused and rejected listings are 404 (same as unknown)", async () => {
    for (const status of ["pending_review", "paused", "rejected"]) {
      const r = await call(createPropertyController(fakeModel({ docs: [row({ status })] })).get, { params: { id: ID } });
      assert.equal(r.status, 404, status); assert.equal(r.body.message, "Property not found.");
    }
  });
  test("malformed ids are 404 without any database lookup", async () => {
    for (const id of ["not-an-id", "123", "507f1f77bcf86cd79943901", "507f1f77bcf86cd7994390111", "{$ne:1}", ""]) {
      const m = fakeModel(); const r = await call(createPropertyController(m).get, { params: { id } });
      assert.equal(r.status, 404, id); assert.equal(m.calls.findOne, undefined);
    }
  });
  test("a failing view counter does not break the page", async () => {
    const r = await call(createPropertyController(fakeModel({ failViews: true })).get, { params: { id: ID } });
    assert.equal(r.status, 200);
  });
});
