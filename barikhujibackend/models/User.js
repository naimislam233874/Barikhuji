"use strict";
const mongoose = require("mongoose");
const { normalizePhone, BD_NATIONAL } = require("../utils/phone");

const ROLES = Object.freeze(["customer", "landlord", "admin"]);
const STATUSES = Object.freeze(["active", "pending_verification", "suspended"]);
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Never leak the hash, even if a controller forgets to select fields.
const hide = (doc, ret) => {
  ret.id = String(ret._id);
  delete ret._id; delete ret.__v; delete ret.passwordHash;
  return ret;
};

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, "Name is required."], trim: true, minlength: [3, "Name must be at least 3 characters."], maxlength: [80, "Name is too long."] },
  email: {
    type: String, required: [true, "Email is required."], unique: true, lowercase: true, trim: true, maxlength: [254, "Email is too long."],
    validate: { validator: v => EMAIL.test(v), message: "Enter a valid email address." }
  },
  phone: {
    type: String, trim: true,
    set: v => (typeof v === "string" ? normalizePhone(v) : v),
    validate: { validator: v => BD_NATIONAL.test(v), message: "Enter a valid Bangladeshi mobile number." }
  },
  // Defence in depth: refuse to store anything that is not a bcrypt hash (e.g. an accidental plaintext password).
  passwordHash: {
    type: String, required: true, select: false,
    validate: { validator: v => BCRYPT_HASH.test(v), message: "passwordHash must be a bcrypt hash." }
  },
  role: { type: String, enum: { values: ROLES, message: "Invalid role." }, default: "customer", required: true },
  status: { type: String, enum: { values: STATUSES, message: "Invalid account status." }, default: "active", required: true },
  lastLoginAt: Date
}, { timestamps: true, toJSON: { transform: hide }, toObject: { transform: hide } });

userSchema.index({ phone: 1 }, { unique: true, sparse: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
User.ROLES = ROLES;
User.STATUSES = STATUSES;
module.exports = User;
