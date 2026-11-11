"use strict";
const mongoose = require("mongoose");
const { BD_NATIONAL } = require("../utils/phone");

// Customer inquiries about a property. The customer is the signed-in session user
// (never taken from the request body); the property is the listing they asked about.
// name/phone/message are what the customer typed on the inquiry form.
const inquirySchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
  name: { type: String, required: [true, "Name is required."], trim: true, minlength: [2, "Name must be at least 2 characters."], maxlength: [80, "Name is too long."] },
  phone: { type: String, trim: true, validate: { validator: v => BD_NATIONAL.test(v), message: "Enter a valid Bangladeshi mobile number." } },
  message: { type: String, required: [true, "Message is required."], trim: true, minlength: [10, "Message must be at least 10 characters."] },
  status: { type: String, enum: { values: ["pending", "replied", "closed"], message: "Invalid inquiry status." }, default: "pending" },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

const Inquiry = mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);
module.exports = Inquiry;
