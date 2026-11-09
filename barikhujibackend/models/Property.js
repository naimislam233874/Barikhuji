"use strict";
const mongoose = require("mongoose");
const C = require("../utils/propertyConstants");
const { isAllowedImage } = require("../utils/propertyInput");

const isInt = v => Number.isInteger(v);
const intField = (label, [min, max], required = true) => ({
  type: Number, required: required ? [true, `${label} is required.`] : false,
  validate: { validator: isInt, message: `${label} must be a whole number.` },
  min: [min, `${label} must be at least ${min}.`], max: [max, `${label} must be at most ${max}.`]
});

// Owner-facing JSON. `landlord` and `reviewedBy` are removed by default so a listing never leaks internal user ids.
// Code that needs them (the admin API, a later step) must build its own output deliberately.
const hide = (doc, ret) => {
  ret.id = String(ret._id);
  delete ret._id; delete ret.__v; delete ret.landlord; delete ret.reviewedBy;
  return ret;
};

const propertySchema = new mongoose.Schema({
  // Ownership. Always taken from the signed-in session, never from the request. `immutable` also blocks later changes.
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },

  title: { type: String, required: [true, "Title is required."], trim: true, minlength: [C.LIMITS.title[0], "Title is too short."], maxlength: [C.LIMITS.title[1], "Title is too long."] },
  description: { type: String, required: [true, "Description is required."], trim: true, minlength: [C.LIMITS.description[0], "Description is too short."], maxlength: [C.LIMITS.description[1], "Description is too long."] },
  type: { type: String, required: true, enum: { values: C.PROPERTY_TYPES, message: "Invalid property type." } },
  furnished: { type: String, required: true, enum: { values: C.FURNISHED, message: "Invalid furnished status." } },

  // Location. `city` and `area` match the frontend search; `address` is optional and not part of public search.
  city: { type: String, required: true, enum: { values: C.CITIES, message: "Invalid city." } },
  area: { type: String, required: [true, "Area is required."], trim: true, minlength: [C.LIMITS.area[0], "Area is too short."], maxlength: [C.LIMITS.area[1], "Area is too long."] },
  address: { type: String, trim: true, maxlength: [C.LIMITS.address[1], "Address is too long."], default: "" },

  rent: intField("Rent", C.LIMITS.rent),
  deposit: intField("Deposit", C.LIMITS.deposit),
  bedrooms: intField("Bedrooms", C.LIMITS.bedrooms),
  bathrooms: intField("Bathrooms", C.LIMITS.bathrooms),

  // "YYYY-MM-DD" text, the same format the frontend filters and sorts on.
  availableFrom: { type: String, required: [true, "Available from is required."], match: [/^\d{4}-\d{2}-\d{2}$/, "Available from must be YYYY-MM-DD."] },

  // "Bachelor" is one of the suitableFor values, so the frontend's bachelor-friendly filter works unchanged.
  suitableFor: {
    type: [{ type: String, enum: { values: C.SUITABLE_FOR, message: "Invalid suitableFor value." } }],
    validate: { validator: a => Array.isArray(a) && a.length >= 1, message: "Select at least one tenant type." }
  },
  amenities: [{ type: String, enum: { values: C.AMENITIES, message: "Invalid amenity." } }],
  images: {
    type: [String], default: [],
    validate: [
      { validator: a => a.length <= C.MAX_IMAGES, message: `Use at most ${C.MAX_IMAGES} photos.` },
      { validator: a => a.every(isAllowedImage), message: "Each photo must be an https:// URL or an /uploads/ path." }
    ]
  },

  // Review workflow. New listings ALWAYS start as pending_review. Only an admin can set active or rejected.
  status: { type: String, required: true, default: "pending_review", enum: { values: C.STATUSES, message: "Invalid listing status." } },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // Admin-controlled flags (frontend fields). Not writable through the landlord API. Approving a listing never touches the landlord's User record.
  verified: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0, min: 0 }
}, { timestamps: true, toJSON: { transform: hide }, toObject: { transform: hide } });

propertySchema.index({ landlord: 1, createdAt: -1 });          // landlord's own list
propertySchema.index({ status: 1, createdAt: -1 });            // admin review queue / newest
propertySchema.index({ status: 1, city: 1, rent: 1 });         // public search (a later step)

const Property = mongoose.models.Property || mongoose.model("Property", propertySchema);
Property.STATUSES = C.STATUSES;
module.exports = Property;
