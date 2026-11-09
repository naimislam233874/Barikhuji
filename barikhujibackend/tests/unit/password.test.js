"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

let bcrypt; try { bcrypt = require("bcryptjs"); } catch (_) { /* run npm install */ }

describe("password hashing (bcryptjs)", { skip: bcrypt ? false : "bcryptjs not installed (run npm install)" }, () => {
  const { createPasswordService } = require("../../utils/password");
  const svc = createPasswordService(4);

  test("hashes are bcrypt, salted, and never contain the password", async () => {
    const a = await svc.hash("Str0ngPass!9"), b = await svc.hash("Str0ngPass!9");
    assert.match(a, /^\$2[aby]\$04\$/);
    assert.notEqual(a, b);
    assert.equal(a.includes("Str0ngPass"), false);
  });
  test("compare accepts the right password and rejects the wrong one", async () => {
    const h = await svc.hash("Str0ngPass!9");
    assert.equal(await svc.compare("Str0ngPass!9", h), true);
    assert.equal(await svc.compare("Str0ngPass!8", h), false);
  });
  test("compareDummy always returns false", async () => assert.equal(await svc.compareDummy("anything1"), false));
});
