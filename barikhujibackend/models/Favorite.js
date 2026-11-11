"use strict";
const mongoose = require("mongoose");

// A favorite is a link between one customer and one property they want to save.
// The compound unique index prevents the same customer from favoriting the same
// property more than once, at the database level (defence in depth).
const favoriteSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
}, { timestamps: true });

favoriteSchema.index({ customer: 1, property: 1 }, { unique: true });

const Favorite = mongoose.models.Favorite || mongoose.model("Favorite", favoriteSchema);
module.exports = Favorite;
