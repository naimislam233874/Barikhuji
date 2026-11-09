"use strict";
// Single source of truth for listing vocabulary. Values match the existing frontend (landlord/property-form.html and browse.html)
// and js/data/sample-properties.js. Pure module: no dependencies.
const PROPERTY_TYPES = Object.freeze(["Apartment", "Room", "Studio", "Mess/Seat"]);
const FURNISHED = Object.freeze(["Furnished", "Semi-furnished", "Unfurnished"]);
const CITIES = Object.freeze(["Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh"]);
const SUITABLE_FOR = Object.freeze(["Bachelor", "Student", "Family"]);
const AMENITIES = Object.freeze(["Lift", "Generator", "Gas", "Wi-Fi", "Parking", "Security", "CCTV"]);
const STATUSES = Object.freeze(["pending_review", "active", "paused", "rejected"]);
// Landlords may only toggle between these. pending_review -> active and rejected are decided by an admin.
const LANDLORD_SETTABLE_STATUSES = Object.freeze(["active", "paused"]);
const MAX_IMAGES = 8;
const LIMITS = Object.freeze({
  title: [10, 100], description: [30, 2000], area: [2, 80], address: [0, 200],
  rent: [1, 10000000], deposit: [0, 50000000], bedrooms: [1, 10], bathrooms: [1, 10]
});

module.exports = { PROPERTY_TYPES, FURNISHED, CITIES, SUITABLE_FOR, AMENITIES, STATUSES, LANDLORD_SETTABLE_STATUSES, MAX_IMAGES, LIMITS };
