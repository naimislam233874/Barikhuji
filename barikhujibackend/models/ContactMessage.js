"use strict";
const mongoose = require("mongoose");
const { BD_NATIONAL } = require("../utils/phone");

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: [true, "Name is required."], trim: true, minlength: [2, "Name must be at least 2 characters."], maxlength: [80, "Name is too long."] },
  email: { type: String, required: [true, "Email is required."], lowercase: true, trim: true, maxlength: [254, "Email is too long."], match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address."] },
  phone: { type: String, trim: true, validate: { validator: v => !v || BD_NATIONAL.test(v), message: "Enter a valid Bangladeshi mobile number." } },
  subject: { type: String, required: [true, "Topic is required."], trim: true, minlength: [2, "Topic is required."], maxlength: [120, "Topic is too long."] },
  message: { type: String, required: [true, "Message is required."], trim: true, minlength: [10, "Message must be at least 10 characters."], maxlength: [2000, "Message is too long."] },
  status: { type: String, enum: ["open", "resolved"], default: "open", index: true }
}, { timestamps: true });

contactMessageSchema.index({ status: 1, createdAt: -1 });

const ContactMessage = mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactMessageSchema);
module.exports = ContactMessage;
