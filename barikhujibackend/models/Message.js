"use strict";
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  body: {
    type: String,
    required: [true, "Message cannot be empty."],
    trim: true,
    minlength: [1, "Message cannot be empty."],
    maxlength: [2000, "Message must be at most 2000 characters."]
  },
  readAt: { type: Date, default: null }
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: 1, _id: 1 });

const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
module.exports = Message;
