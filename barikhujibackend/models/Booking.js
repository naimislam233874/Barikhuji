"use strict";
const mongoose = require("mongoose");
const { BD_NATIONAL } = require("../utils/phone");

const BOOKING_STATUSES = Object.freeze(["pending", "confirmed", "rejected", "cancelled"]);

const historyEntrySchema = new mongoose.Schema({
  status: { type: String, enum: BOOKING_STATUSES, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  role: { type: String, enum: ["customer", "landlord", "admin", "system"], default: "system" },
  note: { type: String, trim: true, maxlength: 500, default: "" },
  at: { type: Date, default: Date.now }
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  moveInDate: {
    type: String,
    required: [true, "Move-in date is required."],
    match: [/^\d{4}-\d{2}-\d{2}$/, "Move-in date must be YYYY-MM-DD."]
  },
  moveOutDate: {
    type: String,
    match: [/^\d{4}-\d{2}-\d{2}$/, "Move-out date must be YYYY-MM-DD."]
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: v => !v || BD_NATIONAL.test(v),
      message: "Enter a valid Bangladeshi mobile number."
    }
  },
  message: { type: String, trim: true, maxlength: [500, "Note must be at most 500 characters."], default: "" },

  status: {
    type: String,
    required: true,
    default: "pending",
    enum: { values: BOOKING_STATUSES, message: "Invalid booking status." }
  },
  requestedAt: { type: Date, default: Date.now },
  decidedAt: Date,
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectionReason: { type: String, trim: true, maxlength: 300, default: "" },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  history: { type: [historyEntrySchema], default: [] }
}, { timestamps: true });

// Defence in depth at database engine level:
// 1. At most ONE confirmed booking may exist per property at any time.
bookingSchema.index({ property: 1 }, { name: "uniq_confirmed_booking_per_property", unique: true, partialFilterExpression: { status: "confirmed" } });
// 2. A customer cannot hold multiple simultaneous pending requests for the same property.
bookingSchema.index({ property: 1, customer: 1 }, { name: "uniq_pending_booking_per_property_customer", unique: true, partialFilterExpression: { status: "pending" } });
// Query indexes for landlord and customer dashboards.
bookingSchema.index({ landlord: 1, status: 1, requestedAt: -1 });
bookingSchema.index({ customer: 1, requestedAt: -1 });

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
Booking.STATUSES = BOOKING_STATUSES;
module.exports = Booking;
