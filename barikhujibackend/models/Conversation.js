"use strict";
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  lastMessageText: { type: String, trim: true, maxlength: 300, default: "" },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  customerUnread: { type: Number, default: 0, min: 0 },
  landlordUnread: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

// One conversation per customer-landlord-property thread.
conversationSchema.index({ property: 1, customer: 1, landlord: 1 }, { unique: true });
conversationSchema.index({ customer: 1, lastMessageAt: -1 });
conversationSchema.index({ landlord: 1, lastMessageAt: -1 });

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
module.exports = Conversation;
