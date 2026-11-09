"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

let mongoose; try { mongoose = require("mongoose"); } catch (_) { /* run npm install */ }
const FAKE_HASH = "$2a$04$" + "a".repeat(53);

describe("User model validation (no database needed)", { skip: mongoose ? false : "mongoose not installed (run npm install)" }, () => {
  const User = require("../../models/User");
  const valid = (over = {}) => new User({ name: "Test User", email: "  Test@Example.COM ", phone: "+8801712345678", passwordHash: FAKE_HASH, ...over });

  test("a valid user passes; email is lower-cased and the phone is normalised", () => {
    const u = valid();
    assert.equal(u.validateSync(), undefined);
    assert.equal(u.email, "test@example.com");
    assert.equal(u.phone, "01712345678");
    assert.equal(u.role, "customer");
    assert.equal(u.status, "active");
  });
  test("unknown roles and statuses are rejected", () => {
    assert.ok(valid({ role: "superadmin" }).validateSync().errors.role);
    assert.ok(valid({ status: "banned" }).validateSync().errors.status);
  });
  test("a plaintext password can never be stored as passwordHash", () => {
    assert.ok(valid({ passwordHash: "PlainText123" }).validateSync().errors.passwordHash);
  });
  test("bad email and bad phone are rejected", () => {
    assert.ok(valid({ email: "nope" }).validateSync().errors.email);
    assert.ok(valid({ phone: "12345" }).validateSync().errors.phone);
  });
  test("toJSON never exposes passwordHash, _id or __v", () => {
    const json = valid().toJSON();
    assert.equal("passwordHash" in json, false);
    assert.equal("_id" in json, false);
    assert.equal("__v" in json, false);
    assert.match(json.id, /^[0-9a-f]{24}$/);
  });
  test("email and phone have unique indexes", () => {
    const idx = User.schema.indexes();
    assert.ok(idx.some(([f, o]) => f.email === 1 && o.unique));
    assert.ok(idx.some(([f, o]) => f.phone === 1 && o.unique && o.sparse));
  });
});
