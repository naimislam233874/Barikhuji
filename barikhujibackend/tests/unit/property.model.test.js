"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

let mongoose; try { mongoose = require("mongoose"); } catch (_) { /* run npm install */ }

describe("Property model (no database needed)", { skip: mongoose ? false : "mongoose not installed (run npm install)" }, () => {
  const Property = require("../../models/Property");
  const id = () => new mongoose.Types.ObjectId();
  const make = (over = {}) => new Property({
    landlord: id(), title: "Sunny 2-Bed Flat near Dhanmondi Lake", description: "Bright, airy flat on the 4th floor with a balcony and a quiet neighbourhood.",
    type: "Apartment", furnished: "Furnished", city: "Dhaka", area: "Dhanmondi", rent: 28000, deposit: 56000, bedrooms: 2, bathrooms: 2,
    availableFrom: "2026-11-01", suitableFor: ["Bachelor"], ...over
  });

  test("a valid listing passes and defaults to pending_review with admin flags off", () => {
    const p = make();
    assert.equal(p.validateSync(), undefined);
    assert.equal(p.status, "pending_review");
    assert.equal(p.verified, false); assert.equal(p.featured, false); assert.equal(p.views, 0);
    assert.ok(p.submittedAt instanceof Date);
    assert.equal(p.reviewedAt, undefined); assert.equal(p.reviewedBy, undefined);
    assert.deepEqual([...p.amenities], []); assert.deepEqual([...p.images], []);
  });
  test("required fields are enforced, including the landlord", () => {
    const errs = new Property({}).validateSync().errors;
    for (const k of ["landlord", "title", "description", "type", "furnished", "city", "area", "rent", "deposit", "bedrooms", "bathrooms", "availableFrom", "suitableFor"]) assert.ok(errs[k], k);
  });
  test("enums: type, furnished, city, status, suitableFor, amenities", () => {
    assert.ok(make({ type: "Castle" }).validateSync().errors.type);
    assert.ok(make({ furnished: "Half" }).validateSync().errors.furnished);
    assert.ok(make({ city: "Atlantis" }).validateSync().errors.city);
    assert.ok(make({ status: "approved" }).validateSync().errors.status);
    for (const s of ["pending_review", "active", "paused", "rejected"]) assert.equal(make({ status: s }).validateSync(), undefined, s);
    assert.ok(make({ suitableFor: ["Everyone"] }).validateSync());
    assert.ok(make({ amenities: ["Jacuzzi"] }).validateSync());
  });
  test("numbers must be whole and in range", () => {
    assert.ok(make({ rent: 0 }).validateSync().errors.rent);
    assert.ok(make({ rent: 12.5 }).validateSync().errors.rent);
    assert.ok(make({ bedrooms: 11 }).validateSync().errors.bedrooms);
    assert.ok(make({ deposit: -1 }).validateSync().errors.deposit);
  });
  test("suitableFor needs at least one value; images are limited and must be safe", () => {
    assert.ok(make({ suitableFor: [] }).validateSync().errors.suitableFor);
    assert.ok(make({ images: ["http://insecure.example/a.jpg"] }).validateSync());
    assert.ok(make({ images: ["javascript:alert(1)"] }).validateSync());
    assert.ok(make({ images: Array.from({ length: 9 }, (_, i) => `https://x.com/${i}.jpg`) }).validateSync());
    assert.equal(make({ images: ["https://x.com/a.jpg", "/uploads/a.jpg"] }).validateSync(), undefined);
  });
  test("availableFrom must look like YYYY-MM-DD", () => assert.ok(make({ availableFrom: "01/11/2026" }).validateSync().errors.availableFrom));
  test("toJSON hides landlord, reviewedBy, _id and __v but exposes id and status", () => {
    const j = make({ reviewedBy: id() }).toJSON();
    for (const k of ["landlord", "reviewedBy", "_id", "__v"]) assert.equal(k in j, false, k);
    assert.match(j.id, /^[0-9a-f]{24}$/); assert.equal(j.status, "pending_review");
  });
  test("landlord ownership is immutable and indexes exist", () => {
    assert.equal(Property.schema.path("landlord").options.immutable, true);
    const idx = Property.schema.indexes();
    assert.ok(idx.some(([f]) => f.landlord === 1 && f.createdAt === -1));
    assert.ok(idx.some(([f]) => f.status === 1 && f.city === 1 && f.rent === 1));
  });
});
