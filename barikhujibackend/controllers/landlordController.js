"use strict";
const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");
const { contentChanged, statusAfterEdit, checkLandlordStatusChange } = require("../utils/propertyRules");

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const STALE = "This listing was changed by someone else while you were editing. Reload it and try again.";

// Ownership is enforced by the QUERY: every lookup filters on landlord = the signed-in user (req.user comes from the session).
// A listing that belongs to someone else is reported as "not found" (404), so ids cannot be probed.
const owned = req => ({ _id: String(req.params.id), landlord: req.user._id });
const notFound = res => res.status(404).json({ message: "Property not found." });
const validId = req => OBJECT_ID.test(String(req.params.id));

// Shape expected by js/api-account.js for the listings table.
// `inquiries` is 0 until the Inquiry model exists (a later step).
const listItem = p => ({ id: String(p._id), title: p.title, area: p.area, city: p.city, rent: p.rent, status: p.status, views: p.views || 0, inquiries: 0, updatedAt: p.updatedAt });

const list = asyncHandler(async (req, res) => {
  const docs = await Property.find({ landlord: req.user._id }).sort({ createdAt: -1 }).limit(200);
  res.json(docs.map(listItem));
});

const create = asyncHandler(async (req, res) => {
  const doc = await Property.create({
    ...req.propertyInput,                 // whitelisted, validated fields only
    landlord: req.user._id,               // from the session, never from the body
    status: "pending_review", submittedAt: new Date(), verified: false, featured: false, views: 0
  });
  res.status(201).json(doc.toJSON());
});

const get = asyncHandler(async (req, res) => {
  if (!validId(req)) return notFound(res);
  const doc = await Property.findOne(owned(req));
  if (!doc) return notFound(res);
  res.json(doc.toJSON());
});

const update = asyncHandler(async (req, res) => {
  if (!validId(req)) return notFound(res);
  const existing = await Property.findOne(owned(req));
  if (!existing) return notFound(res);

  const input = req.propertyInput;
  const changed = contentChanged(existing.toObject(), input);
  const nextStatus = statusAfterEdit(existing.status, changed);

  const update = { $set: { ...input } };
  if (nextStatus !== existing.status) {
    // Back to the admin queue. The previous review decision no longer applies to the new content.
    update.$set.status = nextStatus;
    update.$set.submittedAt = new Date();
    update.$unset = { reviewedAt: 1, reviewedBy: 1 };
  }
  // Matching on the status we read prevents overwriting an admin decision made a moment ago.
  const saved = await Property.findOneAndUpdate({ ...owned(req), status: existing.status }, update, { new: true, runValidators: true });
  if (!saved) return res.status(409).json({ message: STALE });
  res.json(saved.toJSON());
});

const updateStatus = asyncHandler(async (req, res) => {
  if (!validId(req)) return notFound(res);
  const existing = await Property.findOne(owned(req));
  if (!existing) return notFound(res);

  const check = checkLandlordStatusChange(existing.status, req.newStatus);
  if (!check.ok) return res.status(409).json({ message: check.message });
  if (check.noop) return res.json(existing.toJSON());

  const saved = await Property.findOneAndUpdate({ ...owned(req), status: existing.status }, { $set: { status: req.newStatus } }, { new: true, runValidators: true });
  if (!saved) return res.status(409).json({ message: STALE });
  res.json(saved.toJSON());
});

const remove = asyncHandler(async (req, res) => {
  if (!validId(req)) return notFound(res);
  const result = await Property.deleteOne(owned(req));
  if (!result.deletedCount) return notFound(res);
  res.status(204).end();
});

// Shape expected by js/api-account.js: { activeListings, pendingListings, views, inquiries }.
// `inquiries` stays 0 until the Inquiry model exists.
const stats = asyncHandler(async (req, res) => {
  const rows = await Property.aggregate([
    { $match: { landlord: req.user._id } },
    { $group: { _id: "$status", count: { $sum: 1 }, views: { $sum: "$views" } } }
  ]);
  const by = Object.fromEntries(rows.map(r => [r._id, r]));
  res.json({
    activeListings: (by.active && by.active.count) || 0,
    pendingListings: (by.pending_review && by.pending_review.count) || 0,
    views: rows.reduce((sum, r) => sum + (r.views || 0), 0),
    inquiries: 0
  });
});

module.exports = { list, create, get, update, updateStatus, remove, stats };
