"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toPublicProperty, PUBLIC_FIELDS, LANDLORD_FIELDS } = require("../../utils/propertySerializer");

const doc = (over = {}) => ({
  _id: "507f1f77bcf86cd799439011", title: "Sunny 2-Bed Flat near Dhanmondi Lake", area: "Dhanmondi", city: "Dhaka", rent: 28000, deposit: 56000,
  type: "Apartment", bedrooms: 2, bathrooms: 2, furnished: "Semi-furnished", suitableFor: ["Family", "Bachelor"], amenities: ["Lift"],
  availableFrom: "2026-11-01", verified: false, featured: true, images: ["https://x.example.com/1.jpg"], description: "Bright, airy flat on the 4th floor.",
  landlord: { _id: "507f1f77bcf86cd799439022", name: "Mr. Rahman", status: "active" },
  // private fields that must never come out:
  address: "House 5, Road 3, secret lane", status: "active", views: 77, reviewedBy: "507f1f77bcf86cd799439033", reviewedAt: new Date(), submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), __v: 0, ...over
});

test("exact public shape, matching what js/api.js expects", () => {
  const out = toPublicProperty(doc());
  assert.deepEqual(Object.keys(out).sort(), ["amenities", "area", "availableFrom", "bathrooms", "bedrooms", "city", "deposit", "description", "featured", "furnished", "id", "images", "landlord", "rent", "suitableFor", "title", "type", "verified"]);
  assert.equal(out.id, "507f1f77bcf86cd799439011");
  assert.deepEqual(out.landlord, { name: "Mr. Rahman", verified: true });
});
test("private data never appears anywhere in the output", () => {
  const text = JSON.stringify(toPublicProperty(doc({ landlord: { _id: "507f1f77bcf86cd799439022", name: "Mr. Rahman", status: "active", email: "r@example.com", phone: "01711111111", passwordHash: "x" } })));
  for (const secret of ["secret lane", "507f1f77bcf86cd799439022", "507f1f77bcf86cd799439033", "r@example.com", "01711111111", "passwordHash", "reviewedBy", "views", "__v", "\"status\":\"active\"", "createdAt"]) assert.equal(text.includes(secret), false, secret);
});
test("landlord verified follows the ACCOUNT status, not the listing", () => {
  assert.equal(toPublicProperty(doc({ landlord: { name: "A", status: "pending_verification" } })).landlord.verified, false);
  assert.equal(toPublicProperty(doc({ landlord: { name: "A", status: "suspended" } })).landlord.verified, false);
  assert.equal(toPublicProperty(doc({ landlord: { name: "A", status: "active" }, verified: false })).landlord.verified, true);
});
test("an unpopulated or missing landlord falls back to a generic name", () => {
  for (const landlord of [null, undefined, "507f1f77bcf86cd799439022", { _id: "x" }]) assert.deepEqual(toPublicProperty(doc({ landlord })).landlord, { name: "Landlord", verified: false });
});
test("missing arrays become empty arrays; output arrays are copies", () => {
  const src = doc(); const out = toPublicProperty(src);
  out.images.push("https://changed"); assert.equal(src.images.length, 1);
  const bare = toPublicProperty(doc({ suitableFor: undefined, amenities: null, images: undefined }));
  assert.deepEqual([bare.suitableFor, bare.amenities, bare.images], [[], [], []]);
});
test("projections load no private fields", () => {
  for (const f of ["address", "status", "views", "reviewedBy", "reviewedAt", "submittedAt", "email", "phone", "passwordHash"]) assert.equal(PUBLIC_FIELDS.split(" ").includes(f), false, `property.${f}`);
  // The landlord's account status IS loaded, only to compute the boolean `verified`; it is never copied into the output (see the privacy test above).
  assert.equal(LANDLORD_FIELDS, "name status");
});
