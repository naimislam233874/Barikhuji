"use strict";
const mongoose = require("mongoose");

const moderationLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  targetType: { type: String, required: true, enum: ["property", "user", "booking", "contact"] },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  targetLabel: { type: String, trim: true, maxlength: 160, default: "" },
  action: { type: String, required: true, trim: true, maxlength: 80 },
  previousStatus: { type: String, trim: true, maxlength: 50, default: "" },
  newStatus: { type: String, trim: true, maxlength: 50, default: "" },
  note: { type: String, trim: true, maxlength: 500, default: "" }
}, { timestamps: true });

moderationLogSchema.index({ createdAt: -1 });

const ModerationLog = mongoose.models.ModerationLog || mongoose.model("ModerationLog", moderationLogSchema);
module.exports = ModerationLog;
