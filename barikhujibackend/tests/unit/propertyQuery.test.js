"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { parsePropertyQuery, escapeRegex, DEFAULT_LIMIT } = require("../../utils/propertyQuery");

const parse = q => parsePropertyQuery(q);
const err = (q, key) => parse(q).errors[key];

describe("public property query: defaults and safety", () => {
  test("no parameters: only active listings, default sort, page 1, default limit", () => {
    const r = parse({});
    assert.deepEqual(r.filter, { status: "active" });
    assert.deepEqual(r.sort, { featured: -1, createdAt: -1, _id: -1 });
    assert.equal(r.page, 1); assert.equal(r.limit, DEFAULT_LIMIT); assert.deepEqual(r.errors, {});
  });
  test("status can never be set by the client", () => {
    for (const q of [{ status: "pending_review" }, { status: "paused" }, { status: ["active", "rejected"] }, { "status[$ne]": "x" }]) assert.equal(parse(q).filter.status, "active");
  });
  test("blank parameters (as sent by the browse form) are ignored", () => {
    const r = parse({ location: "", minRent: " ", type: "", suitableFor: "", bedrooms: "", furnished: "", availableFrom: "", amenities: "", featured: "", sort: "", page: "", limit: "" });
    assert.deepEqual(r.filter, { status: "active" }); assert.deepEqual(r.errors, {});
  });
  test("unknown parameters are ignored", () => assert.deepEqual(parse({ foo: "bar", landlord: "x" }).filter, { status: "active" }));
  test("arrays and objects are rejected for every filter (query-string injection)", () => {
    for (const key of ["location", "minRent", "maxRent", "type", "suitableFor", "bedrooms", "bathrooms", "furnished", "availableFrom", "amenities", "featured", "sort", "page", "limit"]) {
      assert.match(err({ [key]: ["a", "b"] }, key), /single value/, `${key} array`);
      assert.match(err({ [key]: { $ne: "x" } }, key), /single value/, `${key} object`);
    }
  });
});

describe("public property query: filters", () => {
  test("location: every word must match the area or the city, case-insensitively", () => {
    const { filter } = parse({ location: "Dhanmondi, dhaka" });
    assert.equal(filter.$and.length, 2);
    assert.ok(filter.$and[0].$or[0].area instanceof RegExp);
    assert.equal(filter.$and[0].$or[0].area.flags, "i");
    assert.equal(filter.$and[0].$or[0].area.test("Dhanmondi"), true);
    assert.equal(filter.$and[1].$or[1].city.test("DHAKA"), true);
  });
  test("location text is escaped: regex syntax is matched literally", () => {
    for (const evil of [".*", "(a+)+$", "^", "[a-z]", "a|b", "\\"]) {
      const rx = parse({ location: evil }).filter.$and[0].$or[0].area;
      assert.equal(rx.test("Dhanmondi"), false, evil);          // ".*" must not match everything
      assert.equal(rx.test(`xx${evil}yy`), true, evil);          // it matches the literal text
    }
    assert.equal(escapeRegex("a.b*c"), "a\\.b\\*c");
  });
  test("location limits: too long, too many words, control characters", () => {
    assert.match(err({ location: "x".repeat(101) }, "location"), /too long/);
    assert.match(err({ location: "a b c d e f" }, "location"), /too long/);
    assert.match(err({ location: "ab\u0000cd" }, "location"), /unsupported/);
  });
  test("rent range", () => {
    assert.deepEqual(parse({ minRent: "5000", maxRent: "20000" }).filter.rent, { $gte: 5000, $lte: 20000 });
    assert.deepEqual(parse({ maxRent: "20000" }).filter.rent, { $lte: 20000 });
    assert.deepEqual(parse({ minRent: "0" }).filter.rent, { $gte: 0 });
    for (const bad of ["abc", "-5", "12.5", "1e3", "5 000", "1234567890"]) assert.ok(err({ minRent: bad }, "minRent"), bad);
    assert.match(err({ minRent: "9000", maxRent: "5000" }, "minRent"), /cannot be higher/);
  });
  test("type, suitableFor and furnished accept any letter case and use the canonical value", () => {
    assert.equal(parse({ type: "mess/seat" }).filter.type, "Mess/Seat");
    assert.equal(parse({ suitableFor: "bachelor" }).filter.suitableFor, "Bachelor");
    assert.equal(parse({ furnished: "SEMI-FURNISHED" }).filter.furnished, "Semi-furnished");
    assert.ok(err({ type: "Castle" }, "type")); assert.ok(err({ suitableFor: "Everyone" }, "suitableFor")); assert.ok(err({ furnished: "Half" }, "furnished"));
  });
  test("bedrooms and bathrooms mean 'at least'; 0 means any", () => {
    assert.deepEqual(parse({ bedrooms: "2" }).filter.bedrooms, { $gte: 2 });
    assert.deepEqual(parse({ bathrooms: "3" }).filter.bathrooms, { $gte: 3 });
    assert.equal("bedrooms" in parse({ bedrooms: "0" }).filter, false);
    for (const bad of ["11", "-1", "two", "1.5"]) assert.ok(err({ bedrooms: bad }, "bedrooms"), bad);
  });
  test("availableFrom: real YYYY-MM-DD dates only, matched as 'on or before'", () => {
    assert.deepEqual(parse({ availableFrom: "2026-11-01" }).filter.availableFrom, { $lte: "2026-11-01" });
    for (const bad of ["2026-02-30", "01/11/2026", "tomorrow", "2026-13-01"]) assert.ok(err({ availableFrom: bad }, "availableFrom"), bad);
  });
  test("amenities: comma separated, canonical, de-duplicated, must all be present", () => {
    assert.deepEqual(parse({ amenities: "lift, WI-FI,lift" }).filter.amenities, { $all: ["Lift", "Wi-Fi"] });
    assert.ok(err({ amenities: "Lift,Jacuzzi" }, "amenities")); assert.ok(err({ amenities: "," }, "amenities"));
  });
  test("featured: 1/true filter; 0/false mean no filter; anything else is an error", () => {
    assert.equal(parse({ featured: "1" }).filter.featured, true); assert.equal(parse({ featured: "TRUE" }).filter.featured, true);
    assert.equal("featured" in parse({ featured: "0" }).filter, false); assert.equal("featured" in parse({ featured: "false" }).filter, false);
    assert.ok(err({ featured: "maybe" }, "featured"));
  });
  test("several filters combine", () => {
    const f = parse({ location: "mirpur", maxRent: "10000", suitableFor: "Bachelor", type: "Room" }).filter;
    assert.deepEqual(Object.keys(f).sort(), ["$and", "rent", "status", "suitableFor", "type"]);
  });
});

describe("public property query: sorting and paging", () => {
  test("sort options each end in _id so pages are stable", () => {
    assert.deepEqual(parse({ sort: "rentAsc" }).sort, { rent: 1, _id: 1 });
    assert.deepEqual(parse({ sort: "rentDesc" }).sort, { rent: -1, _id: -1 });
    assert.deepEqual(parse({ sort: "newest" }).sort, { createdAt: -1, _id: -1 });
    for (const bad of ["price", "__proto__", "constructor", "toString", "rent", "RENTASC"]) assert.ok(err({ sort: bad }, "sort"), bad);
  });
  test("page and limit are bounded integers", () => {
    assert.deepEqual([parse({ page: "3", limit: "6" }).page, parse({ page: "3", limit: "6" }).limit], [3, 6]);
    assert.equal(parse({ limit: "50" }).limit, 50);
    for (const bad of ["0", "-1", "abc", "1.5", "501", "99999"]) assert.ok(err({ page: bad }, "page"), `page ${bad}`);
    for (const bad of ["0", "51", "-1", "abc", "1000"]) assert.ok(err({ limit: bad }, "limit"), `limit ${bad}`);
  });
  test("a missing or non-object query is handled", () => { for (const q of [undefined, null, "x", 5]) assert.deepEqual(parse(q).filter, { status: "active" }); });
});
