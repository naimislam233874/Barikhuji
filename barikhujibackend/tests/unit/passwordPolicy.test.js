"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkPassword } = require("../../utils/passwordPolicy");
const { normalizePhone, BD_NATIONAL } = require("../../utils/phone");

test("accepts a reasonable password", () => assert.equal(checkPassword("Str0ngPass!9").ok, true));
test("rejects short passwords", () => assert.match(checkPassword("a1b2c3").message, /at least 8/));
test("requires a letter and a number", () => {
  assert.equal(checkPassword("abcdefghij").ok, false);
  assert.equal(checkPassword("1234567890123").ok, false);
});
test("rejects common passwords and the email itself", () => {
  assert.equal(checkPassword("Password1").ok, false);
  assert.equal(checkPassword("user1234@example.com", { email: "USER1234@example.com" }).ok, false);
});
test("rejects passwords over 72 bytes instead of silently truncating", () => {
  assert.equal(checkPassword("a1".repeat(36)).ok, true);   // exactly 72 bytes
  assert.equal(checkPassword("a1".repeat(37)).ok, false);  // 74 bytes
  assert.equal(checkPassword("ক1".repeat(25)).ok, false);   // multi-byte characters count as bytes
});
test("non-strings are rejected", () => {
  assert.equal(checkPassword(undefined).ok, false);
  assert.equal(checkPassword({ $gt: "" }).ok, false);
});
test("admin policy can demand 12 characters", () => assert.equal(checkPassword("Abc12345", { minLength: 12 }).ok, false));
test("phone numbers normalise to 01XXXXXXXXX", () => {
  for (const v of ["01712345678", "8801712345678", "+8801712345678", " 017-1234 5678 "]) assert.equal(normalizePhone(v), "01712345678");
  assert.equal(BD_NATIONAL.test(normalizePhone("01212345678")), false); // 012 is not a valid operator prefix
});
