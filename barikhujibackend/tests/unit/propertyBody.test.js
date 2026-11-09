"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { requireJson, parseListingBody, parseStatusBody } = require("../../middleware/propertyBody");

const run = (mw, req) => new Promise(resolve => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ passed: false, status: this.statusCode, body: b }); } };
  mw(req, res, () => resolve({ passed: true, req }));
});
const ok = { title: "Sunny 2-Bed Flat near Dhanmondi Lake", description: "Bright, airy flat on the 4th floor with a balcony.", type: "Apartment", furnished: "Furnished", city: "Dhaka", area: "Dhanmondi", rent: 28000, deposit: 56000, bedrooms: 2, bathrooms: 2, availableFrom: new Date().toISOString().slice(0, 10), suitableFor: ["Family"] };

test("requireJson: multipart uploads get a clear 415 (the current frontend form sends multipart)", async () => {
  const r = await run(requireJson, { headers: { "content-type": "multipart/form-data; boundary=abc" } });
  assert.equal(r.status, 415); assert.match(r.body.message, /JSON/);
});
test("requireJson: JSON and bodiless requests pass", async () => {
  assert.equal((await run(requireJson, { headers: { "content-type": "application/json; charset=utf-8" } })).passed, true);
  assert.equal((await run(requireJson, { headers: {} })).passed, true);
  assert.equal((await run(requireJson, { headers: { "content-type": "text/plain" } })).status, 415);
});
test("parseListingBody: valid body sets req.propertyInput and drops forbidden keys", async () => {
  const r = await run(parseListingBody, { body: { ...ok, status: "active", landlord: "507f1f77bcf86cd799439011", featured: true } });
  assert.equal(r.passed, true);
  assert.equal(r.req.propertyInput.rent, 28000);
  for (const k of ["status", "landlord", "featured"]) assert.equal(k in r.req.propertyInput, false);
});
test("parseListingBody: invalid body gets 422 with the first message and a field map", async () => {
  const r = await run(parseListingBody, { body: { ...ok, rent: -5 } });
  assert.equal(r.status, 422); assert.match(r.body.message, /Rent/); assert.ok(r.body.errors.rent);
});
test("parseStatusBody: only active or paused", async () => {
  for (const s of ["active", "paused"]) { const r = await run(parseStatusBody, { body: { status: s } }); assert.equal(r.passed, true); assert.equal(r.req.newStatus, s); }
  for (const s of ["pending_review", "rejected", "approved", "Active", "", 1, null, undefined]) assert.equal((await run(parseStatusBody, { body: { status: s } })).status, 422, String(s));
  assert.equal((await run(parseStatusBody, { body: undefined })).status, 422);
});
