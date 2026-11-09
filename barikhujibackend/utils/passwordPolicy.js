"use strict";
// Pure password rules (no dependencies). bcrypt only uses the first 72 BYTES, so longer passwords are rejected
// rather than silently truncated.
const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
  "11111111", "iloveyou", "admin123", "letmein1", "welcome1", "bangladesh", "bangladesh1", "dhaka1234"]);

function checkPassword(password, { email, minLength = 8 } = {}) {
  if (typeof password !== "string") return { ok: false, message: "Password is required." };
  if (password.length < minLength) return { ok: false, message: `Password must be at least ${minLength} characters.` };
  if (Buffer.byteLength(password, "utf8") > 72) return { ok: false, message: "Password must be 72 bytes or fewer." };
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return { ok: false, message: "Password must include at least one letter and one number." };
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return { ok: false, message: "That password is too common. Choose a different one." };
  if (typeof email === "string" && email && lower === email.toLowerCase()) return { ok: false, message: "Password must not be the same as your email." };
  return { ok: true, message: "" };
}

module.exports = { checkPassword };
