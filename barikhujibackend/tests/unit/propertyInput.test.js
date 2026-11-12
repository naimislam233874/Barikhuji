"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { parsePropertyInput, isRealDate, isAllowedImage, EDITABLE_FIELDS } = require("../../utils/propertyInput");

const today = new Date().toISOString().slice(0, 10);
const good = (over = {}) => ({
  title: "Sunny 2-Bed Flat near Dhanmondi Lake", description: "Bright, airy flat on the 4th floor with a balcony and a quiet neighbourhood.",
  type: "Apartment", furnished: "Semi-furnished", city: "Dhaka", area: "Dhanmondi", rent: 28000, deposit: 56000,
  bedrooms: 2, bathrooms: 2, availableFrom: today, suitableFor: ["Family"], ...over
});
const parse = (body, opts) => parsePropertyInput(body, opts);
const err = (over, field) => parse(good(over)).errors[field];

describe("property input: valid data", () => {
  test("a complete listing parses with no errors", () => {
    const { value, errors } = parse(good({ amenities: ["Lift", "Gas"], images: ["https://cdn.example.com/a.jpg"], address: "House 5, Road 3" }));
    assert.deepEqual(errors, {});
    assert.equal(value.rent, 28000);
    assert.deepEqual(value.amenities, ["Lift", "Gas"]);
  });
  test("bachelor-friendly listings are expressed through suitableFor", () => {
    assert.deepEqual(parse(good({ suitableFor: ["Bachelor", "Student"] })).value.suitableFor, ["Bachelor", "Student"]);
  });
  test("strings are trimmed; numeric strings are accepted for numeric fields", () => {
    const { value } = parse(good({ title: "   Sunny 2-Bed Flat near Dhanmondi Lake  ", rent: "28000", bedrooms: "2" }));
    assert.equal(value.title, "Sunny 2-Bed Flat near Dhanmondi Lake");
    assert.equal(value.rent, 28000);
    assert.equal(value.bedrooms, 2);
  });
  test("list fields are de-duplicated", () => {
    assert.deepEqual(parse(good({ suitableFor: ["Family", "Family", "Student"] })).value.suitableFor, ["Family", "Student"]);
  });
  test("optional fields left out stay out of the result (so a PUT keeps the old photos)", () => {
    const { value } = parse(good());
    for (const k of ["images", "amenities", "address"]) assert.equal(k in value, false);
  });
  test("address may be cleared with null or an empty string", () => {
    assert.equal(parse(good({ address: null })).value.address, "");
    assert.equal(parse(good({ address: "" })).value.address, "");
  });
});

describe("property input: mass assignment", () => {
  test("status, landlord, featured, verified, views, reviewer and unknown keys are never copied", () => {
    const { value } = parse(good({ status: "active", landlord: "507f1f77bcf86cd799439011", featured: true, verified: true, views: 9999,
      reviewedBy: "x", reviewedAt: "2026-01-01", submittedAt: "2000-01-01", _id: "abc", role: "admin", __proto__: { admin: true }, isAdmin: true }));
    assert.deepEqual(Object.keys(value).sort(), [...EDITABLE_FIELDS].filter(k => k in value).sort());
    for (const k of ["status", "landlord", "featured", "verified", "views", "reviewedBy", "reviewedAt", "submittedAt", "_id", "role", "isAdmin"]) assert.equal(k in value, false, k);
  });
  test("a non-object body produces required-field errors, not a crash", () => {
    for (const body of [undefined, null, "text", 42, [], [good()]]) assert.ok(Object.keys(parse(body).errors).length >= 10);
  });
});

describe("property input: validation rules", () => {
  test("required fields are reported when missing", () => {
    const { errors } = parse({});
    for (const k of ["title", "description", "type", "furnished", "city", "area", "rent", "deposit", "bedrooms", "bathrooms", "availableFrom", "suitableFor"]) assert.match(errors[k], /required/i, k);
    for (const k of ["address", "amenities", "images"]) assert.equal(k in errors, false);
  });
  test("requireAll:false only validates what was sent", () => {
    assert.deepEqual(parse({ rent: 100 }, { requireAll: false }).errors, {});
    assert.ok(parse({ rent: 0 }, { requireAll: false }).errors.rent);
  });
  test("title length limits and unbounded description length", () => {
    assert.ok(err({ title: "short" }, "title")); assert.ok(err({ title: "x".repeat(101) }, "title")); assert.equal(err({ title: "x".repeat(100) }, "title"), undefined);
    assert.equal(err({ description: "smoking not allow" }, "description"), undefined);
    assert.equal(err({ description: "a" }, "description"), undefined);
    assert.equal(err({ description: "d".repeat(5000) }, "description"), undefined);
    assert.ok(err({ description: "   " }, "description"));
  });
  test("wrong types are rejected (objects, arrays, numbers where text is expected)", () => {
    assert.ok(err({ title: 12345678901 }, "title")); assert.ok(err({ title: { $gt: "" } }, "title")); assert.ok(err({ area: ["Dhanmondi"] }, "area"));
    assert.ok(err({ rent: { $gt: 0 } }, "rent")); assert.ok(err({ suitableFor: "Family" }, "suitableFor"));
  });
  test("control characters are rejected in single-line fields but newlines are fine in the description", () => {
    assert.ok(err({ title: "Nice flat\u0000 in Dhaka city" }, "title"));
    assert.ok(err({ title: "Nice flat\nin Dhaka city centre" }, "title"));
    assert.equal(err({ description: "Line one of the description.\nLine two of the description." }, "description"), undefined);
  });
  test("enums: type, furnished, city", () => {
    assert.ok(err({ type: "Castle" }, "type")); assert.ok(err({ type: "apartment" }, "type"));
    assert.ok(err({ furnished: "Half" }, "furnished")); assert.ok(err({ city: "Atlantis" }, "city"));
    for (const t of ["Apartment", "Room", "Studio", "Mess/Seat"]) assert.equal(err({ type: t }, "type"), undefined);
  });
  test("rent, deposit, bedrooms, bathrooms: whole numbers within limits", () => {
    for (const v of [0, -1, 12.5, "12.5", "28k", "1e3", NaN, Infinity, 10000001, true, null]) assert.ok(err({ rent: v }, "rent"), `rent ${v}`);
    assert.equal(err({ rent: 1 }, "rent"), undefined); assert.equal(err({ rent: 10000000 }, "rent"), undefined);
    assert.equal(err({ deposit: 0 }, "deposit"), undefined); assert.ok(err({ deposit: -5 }, "deposit"));
    assert.ok(err({ bedrooms: 0 }, "bedrooms")); assert.ok(err({ bedrooms: 11 }, "bedrooms")); assert.ok(err({ bathrooms: 1.5 }, "bathrooms"));
  });
  test("suitableFor needs at least one valid option; amenities must be known", () => {
    assert.ok(err({ suitableFor: [] }, "suitableFor")); assert.ok(err({ suitableFor: ["Everyone"] }, "suitableFor")); assert.ok(err({ suitableFor: [1] }, "suitableFor"));
    assert.ok(err({ amenities: ["Jacuzzi"] }, "amenities")); assert.equal(err({ amenities: [] }, "amenities"), undefined);
  });
  test("availableFrom must be a real date within range", () => {
    for (const v of ["2026-13-01", "2026-02-30", "01/11/2026", "2026-1-1", "tomorrow", 20261101, "1999-12-31", "2099-01-01"]) assert.ok(err({ availableFrom: v }, "availableFrom"), String(v));
    assert.equal(err({ availableFrom: today }, "availableFrom"), undefined);
    assert.equal(isRealDate("2028-02-29"), true); assert.equal(isRealDate("2027-02-29"), false);
  });
  test("photos: https URLs or /uploads/ paths only, max 10", () => {
    for (const u of ["http://x.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "//cdn.example.com/a.jpg", "file:///etc/passwd", "/uploads/../secret.png", "/uploads//a.png", "/etc/passwd", "https://", "https://x.com/a b.jpg", ""]) assert.equal(isAllowedImage(u), false, u);
    for (const u of ["https://images.unsplash.com/photo-1?w=1000", "/uploads/2026/a-b_c.jpg"]) assert.equal(isAllowedImage(u), true, u);
    assert.ok(err({ images: Array.from({ length: 11 }, (_, i) => `https://x.com/${i}.jpg`) }, "images"));
    assert.equal(err({ images: Array.from({ length: 10 }, (_, i) => `https://x.com/${i}.jpg`) }, "images"), undefined);
    assert.ok(err({ images: "https://x.com/a.jpg" }, "images"));
  });
});
