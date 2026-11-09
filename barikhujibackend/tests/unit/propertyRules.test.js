"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { contentChanged, statusAfterEdit, checkLandlordStatusChange } = require("../../utils/propertyRules");

const stored = { title: "Sunny 2-Bed Flat near Dhanmondi Lake", rent: 28000, suitableFor: ["Family", "Student"], amenities: ["Lift", "Gas"], images: ["https://x.com/1.jpg", "https://x.com/2.jpg"], address: "" };

describe("which edits count as content changes", () => {
  test("identical values are not a change (including reordered suitableFor/amenities)", () => {
    assert.equal(contentChanged(stored, { title: stored.title, rent: 28000 }), false);
    assert.equal(contentChanged(stored, { suitableFor: ["Student", "Family"], amenities: ["Gas", "Lift"] }), false);
  });
  test("price, text, tenants and amenities changes are changes", () => {
    assert.equal(contentChanged(stored, { rent: 29000 }), true);
    assert.equal(contentChanged(stored, { title: "A different title entirely" }), true);
    assert.equal(contentChanged(stored, { suitableFor: ["Family"] }), true);
    assert.equal(contentChanged(stored, { amenities: ["Lift"] }), true);
  });
  test("photo order matters, and address undefined equals empty", () => {
    assert.equal(contentChanged(stored, { images: ["https://x.com/2.jpg", "https://x.com/1.jpg"] }), true);
    assert.equal(contentChanged(stored, { address: "" }), false);
    assert.equal(contentChanged({ ...stored, address: undefined }, { address: "" }), false);
  });
  test("fields the client did not send are ignored; unknown keys are never content", () => {
    assert.equal(contentChanged(stored, {}), false);
    assert.equal(contentChanged(stored, { status: "active", featured: true }), false);
  });
});

describe("status after an edit", () => {
  test("an edit with real changes sends active, paused and rejected listings back to pending_review", () => {
    for (const s of ["active", "paused", "rejected", "pending_review"]) assert.equal(statusAfterEdit(s, true), "pending_review", s);
  });
  test("an edit without changes keeps the current status", () => {
    for (const s of ["active", "paused", "rejected", "pending_review"]) assert.equal(statusAfterEdit(s, false), s, s);
  });
});

describe("landlord status changes", () => {
  test("active <-> paused is allowed; the same status is a no-op", () => {
    assert.deepEqual(checkLandlordStatusChange("active", "paused"), { ok: true, noop: false });
    assert.deepEqual(checkLandlordStatusChange("paused", "active"), { ok: true, noop: false });
    assert.deepEqual(checkLandlordStatusChange("active", "active"), { ok: true, noop: true });
  });
  test("a pending listing cannot be activated or paused by its landlord", () => {
    for (const to of ["active", "paused"]) { const r = checkLandlordStatusChange("pending_review", to); assert.equal(r.ok, false); assert.match(r.message, /admin review/); }
  });
  test("a rejected listing cannot be reactivated; it must be edited and resubmitted", () => {
    const r = checkLandlordStatusChange("rejected", "active"); assert.equal(r.ok, false); assert.match(r.message, /Edit it/);
  });
  test("landlords can never choose pending_review, rejected, approved or anything else", () => {
    for (const to of ["pending_review", "rejected", "approved", "ACTIVE", "", undefined, null, {}]) assert.equal(checkLandlordStatusChange("active", to).ok, false, String(to));
  });
});
