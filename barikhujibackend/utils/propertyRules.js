"use strict";
// Business rules for listing status. Pure functions, no dependencies.
const { EDITABLE_FIELDS } = require("./propertyInput");
const { LANDLORD_SETTABLE_STATUSES } = require("./propertyConstants");

// Every editable field changes what renters see (price, place, photos...), so a changed listing is re-reviewed.
// To relax this later (for example let landlords change availableFrom without review) remove it from this list.
const CONTENT_FIELDS = EDITABLE_FIELDS;
const ORDER_INSENSITIVE = new Set(["suitableFor", "amenities"]);

const norm = v => (v === undefined || v === null ? "" : v);
function sameValue(key, a, b) {
  a = norm(a); b = norm(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const x = ORDER_INSENSITIVE.has(key) ? [...a].sort() : a, y = ORDER_INSENSITIVE.has(key) ? [...b].sort() : b;
    return x.every((v, i) => v === y[i]);
  }
  return a === b;
}

// `incoming` holds only the fields the client sent (already validated). Compares them with the stored listing.
function contentChanged(current, incoming) {
  return CONTENT_FIELDS.some(k => Object.prototype.hasOwnProperty.call(incoming, k) && !sameValue(k, current[k], incoming[k]));
}

// A changed active/paused/rejected listing goes back to the admin queue. A pending listing stays pending.
// An unchanged edit never alters the status.
function statusAfterEdit(currentStatus, changed) {
  if (!changed) return currentStatus;
  return "pending_review";
}

// Landlords can only switch between active and paused, and only on listings that an admin has already approved.
function checkLandlordStatusChange(currentStatus, requestedStatus) {
  if (!LANDLORD_SETTABLE_STATUSES.includes(requestedStatus)) return { ok: false, message: 'Status must be "active" or "paused".' };
  if (currentStatus === "pending_review") return { ok: false, message: "This listing is waiting for admin review. You can pause or activate it after it is approved." };
  if (currentStatus === "rejected") return { ok: false, message: "This listing was rejected. Edit it to resubmit it for review." };
  if (currentStatus === "booked") return { ok: false, message: "This listing has a confirmed booking and cannot be changed manually." };
  if (!LANDLORD_SETTABLE_STATUSES.includes(currentStatus)) return { ok: false, message: "This listing's status cannot be changed." };
  return { ok: true, noop: currentStatus === requestedStatus };
}

module.exports = { CONTENT_FIELDS, contentChanged, statusAfterEdit, checkLandlordStatusChange };
