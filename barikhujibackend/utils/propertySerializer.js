"use strict";
// The ONLY shape public visitors ever see. Built from an explicit allow-list: a field added to the Property model later
// stays private until it is added here on purpose.
// Never included: address, landlord id/email/phone, status, reviewedBy/reviewedAt, submittedAt, views, timestamps.
// Shape matches what js/api.js normalizeProperty() expects:
//   { id, title, area, city, rent, deposit, type, bedrooms, bathrooms, furnished, suitableFor[], amenities[], availableFrom,
//     verified, featured, images[], description, landlord: { name, verified } }
// landlord.responseTime is omitted because it is not stored anywhere; the frontend shows "Not available".

// MongoDB projection used when reading: fields not listed here are never even loaded.
const PUBLIC_FIELDS = "title area city rent deposit type bedrooms bathrooms furnished suitableFor amenities availableFrom verified featured images description landlord";
// Only these two landlord fields are loaded through populate().
const LANDLORD_FIELDS = "name status";

function toPublicProperty(p) {
  const l = p && p.landlord && typeof p.landlord === "object" && typeof p.landlord.name === "string" ? p.landlord : null;
  return {
    id: String(p._id),
    title: p.title, area: p.area, city: p.city,
    rent: p.rent, deposit: p.deposit,
    type: p.type, bedrooms: p.bedrooms, bathrooms: p.bathrooms, furnished: p.furnished,
    suitableFor: Array.isArray(p.suitableFor) ? [...p.suitableFor] : [],
    amenities: Array.isArray(p.amenities) ? [...p.amenities] : [],
    availableFrom: p.availableFrom,
    verified: !!p.verified, featured: !!p.featured,
    images: Array.isArray(p.images) ? [...p.images] : [],
    description: p.description,
    // A landlord counts as verified once an admin has activated the ACCOUNT (status "active"; new landlords start as
    // "pending_verification"). Approving a listing never changes this.
    landlord: { name: l ? l.name : "Landlord", verified: !!(l && l.status === "active") }
  };
}

module.exports = { toPublicProperty, PUBLIC_FIELDS, LANDLORD_FIELDS };
