"use strict";
// Strict, whitelist-based parser for landlord listing input. Pure (no dependencies) so it is fully unit-testable.
// Only the keys in RULES can ever come out. status, landlord, featured, verified, views, reviewedBy... are NOT in RULES,
// so a client can never set them (mass-assignment protection). Unknown keys are ignored, never copied.
const C = require("./propertyConstants");

const SINGLE_LINE_BAD = /[\u0000-\u001f\u007f]/;
const MULTI_LINE_BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UPLOAD_PATH = /^\/uploads\/[A-Za-z0-9._\/-]+$/;

function isRealDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Photos: absolute https URLs, or a server path under /uploads/ (reserved for the upload step). Nothing else
// (no javascript:, data:, http:, file:, protocol-relative or path-traversal values).
function isAllowedImage(u) {
  if (typeof u !== "string" || u.length === 0 || u.length > 500 || /\s/.test(u)) return false;
  if (UPLOAD_PATH.test(u)) return !u.includes("..") && !u.includes("//");
  try { const url = new URL(u); return url.protocol === "https:" && !!url.hostname; } catch (_) { return false; }
}

const str = (label, [min, max], multiline = false) => v => {
  if (typeof v !== "string") return { error: `${label} must be text.` };
  const s = v.trim();
  if ((multiline ? MULTI_LINE_BAD : SINGLE_LINE_BAD).test(s)) return { error: `${label} contains unsupported characters.` };
  if (s.length < min || s.length > max) return { error: min === 0 ? `${label} must be at most ${max} characters.` : `${label} must be between ${min} and ${max} characters.` };
  return { value: s };
};

const int = (label, [min, max]) => v => {
  let n = v;
  if (typeof v === "string" && /^\d{1,9}$/.test(v.trim())) n = Number(v.trim()); // tolerate "28000"; reject "28k", "1e3", "12.5"
  if (!Number.isInteger(n)) return { error: `${label} must be a whole number.` };
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
  return { value: n };
};

const oneOf = (label, list) => v =>
  (typeof v === "string" && list.includes(v)) ? { value: v } : { error: `${label} must be one of: ${list.join(", ")}.` };

const listOf = (label, list, { min = 0 } = {}) => v => {
  if (!Array.isArray(v)) return { error: `${label} must be a list.` };
  if (v.some(x => typeof x !== "string" || !list.includes(x))) return { error: `${label} contains an unsupported value. Allowed: ${list.join(", ")}.` };
  const unique = [...new Set(v)];
  if (unique.length < min) return { error: `Select at least ${min} option for ${label.toLowerCase()}.` };
  return { value: unique };
};

const date = label => v => {
  if (!isRealDate(v)) return { error: `${label} must be a real date in YYYY-MM-DD format.` };
  const limit = new Date(); limit.setUTCFullYear(limit.getUTCFullYear() + 3);
  if (v < "2000-01-01" || v > limit.toISOString().slice(0, 10)) return { error: `${label} must be within the next 3 years.` };
  return { value: v };
};

const images = v => {
  if (!Array.isArray(v)) return { error: "Photos must be a list of image URLs." };
  if (v.length > C.MAX_IMAGES) return { error: `Use at most ${C.MAX_IMAGES} photos.` };
  if (!v.every(isAllowedImage)) return { error: "Each photo must be an https:// URL or an /uploads/ path." };
  return { value: [...new Set(v)] };
};

const address = v => (v === null ? { value: "" } : str("Address", C.LIMITS.address)(v));

const RULES = {
  title:         { label: "Title",          required: true,  parse: str("Title", C.LIMITS.title) },
  description:   { label: "Description",    required: true,  parse: str("Description", C.LIMITS.description, true) },
  type:          { label: "Property type",  required: true,  parse: oneOf("Property type", C.PROPERTY_TYPES) },
  furnished:     { label: "Furnished status", required: true, parse: oneOf("Furnished status", C.FURNISHED) },
  city:          { label: "City",           required: true,  parse: oneOf("City", C.CITIES) },
  area:          { label: "Area",           required: true,  parse: str("Area", C.LIMITS.area) },
  address:       { label: "Address",        required: false, parse: address },
  rent:          { label: "Rent",           required: true,  parse: int("Rent", C.LIMITS.rent) },
  deposit:       { label: "Deposit",        required: true,  parse: int("Deposit", C.LIMITS.deposit) },
  bedrooms:      { label: "Bedrooms",       required: true,  parse: int("Bedrooms", C.LIMITS.bedrooms) },
  bathrooms:     { label: "Bathrooms",      required: true,  parse: int("Bathrooms", C.LIMITS.bathrooms) },
  availableFrom: { label: "Available from", required: true,  parse: date("Available from") },
  suitableFor:   { label: "Suitable for",   required: true,  parse: listOf("Suitable for", C.SUITABLE_FOR, { min: 1 }) },
  amenities:     { label: "Amenities",      required: false, parse: listOf("Amenities", C.AMENITIES) },
  images:        { label: "Photos",         required: false, parse: images }
};
const EDITABLE_FIELDS = Object.freeze(Object.keys(RULES));

// requireAll: every required field must be present (used for POST and PUT). Optional fields that are absent are simply
// left out of `value`, so on PUT they stay unchanged (e.g. an edit without new photos keeps the old photos).
function parsePropertyInput(body, { requireAll = true } = {}) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const value = {}, errors = {};
  for (const [key, rule] of Object.entries(RULES)) {
    const raw = Object.prototype.hasOwnProperty.call(src, key) ? src[key] : undefined;
    if (raw === undefined) { if (requireAll && rule.required) errors[key] = `${rule.label} is required.`; continue; }
    const r = rule.parse(raw);
    if (r.error) errors[key] = r.error; else value[key] = r.value;
  }
  return { value, errors };
}

module.exports = { parsePropertyInput, EDITABLE_FIELDS, isRealDate, isAllowedImage };
