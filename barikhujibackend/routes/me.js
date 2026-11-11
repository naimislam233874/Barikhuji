"use strict";
const express = require("express");
const Favorite = require("../models/Favorite");
const Inquiry = require("../models/Inquiry");
const Property = require("../models/Property");
const bookingCtrl = require("../controllers/bookingController");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { toPublicProperty, PUBLIC_FIELDS, LANDLORD_FIELDS } = require("../utils/propertySerializer");

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const withLandlord = { path: "landlord", select: LANDLORD_FIELDS };

// Mounted in app.js as /api/v1/me. Everything here is for signed-in customers only:
// ownership comes from the session (req.user), never from the request, so one customer
// can never see or change another customer's favorites. A favorite of a listing that has
// since become hidden (paused/rejected/edited) still shows to its owner, but NEW favorites
// can only point at active listings.
function createMeRouter() {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(requireAuth, requireRole("customer"));

  // GET /me/favorites -> { items: [public property...], total } (js/api-account.js accepts an array or { items })
  router.get("/favorites", asyncHandler(async (req, res) => {
    const favs = await Favorite.find({ customer: req.user._id }).sort({ createdAt: -1 }).lean();
    const ids = favs.map(f => f.property);
    const docs = ids.length
      ? await Property.find({ _id: { $in: ids }, status: { $ne: "booked" } }).select(PUBLIC_FIELDS).populate(withLandlord).lean()
      : [];
    // Keep the customer's own order (newest favorite first), not the DB's _id order.
    const byId = new Map(docs.map(d => [String(d._id), d]));
    const items = ids.map(id => byId.get(String(id))).filter(Boolean).map(toPublicProperty);
    res.json({ items, total: items.length });
  }));

  // POST /me/favorites/:propertyId -> 201 { saved: true, propertyId }; duplicates get 200 (idempotent).
  router.post("/favorites/:propertyId", asyncHandler(async (req, res) => {
    const id = String(req.params.propertyId);
    if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Property not found." });
    const property = await Property.findOne({ _id: id, status: "active" }).select("_id").lean();
    if (!property) return res.status(404).json({ message: "Property not found." });
    try {
      await Favorite.create({ customer: req.user._id, property: property._id });
    } catch (err) {
      if (err && err.code === 11000) return res.json({ saved: true, propertyId: id, duplicate: true }); // already favorited: fine
      throw err;
    }
    res.status(201).json({ saved: true, propertyId: id });
  }));

  // DELETE /me/favorites/:propertyId -> 204; removing something not favorited is also 204 (idempotent).
  router.delete("/favorites/:propertyId", asyncHandler(async (req, res) => {
    const id = String(req.params.propertyId);
    if (!OBJECT_ID.test(id)) return res.status(204).end();
    await Favorite.deleteOne({ customer: req.user._id, property: id });
    res.status(204).end();
  }));

  // GET /me/inquiries -> { items: [{ id, propertyId, propertyTitle, message, sentAt, status }], total }
  // Only this customer's inquiries. propertyTitle comes from the listing (empty if the listing
  // was deleted since, so the frontend can fall back to "Removed listing").
  router.get("/inquiries", asyncHandler(async (req, res) => {
    const docs = await Inquiry.find({ customer: req.user._id }).sort({ sentAt: -1 }).populate("property", "title").lean();
    const items = docs.map(d => ({
      id: String(d._id),
      propertyId: String(d.property ? d.property._id : ""),
      propertyTitle: d.property && d.property.title ? d.property.title : "",
      message: d.message,
      sentAt: d.sentAt,
      status: d.status,
    }));
    res.json({ items, total: items.length });
  }));

  router.get("/bookings", bookingCtrl.listForCustomer);
  router.post("/bookings/:id/cancel", bookingCtrl.cancelByCustomer);

  return router;
}

module.exports = { createMeRouter };
