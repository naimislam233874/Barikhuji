"use strict";
const Property = require("../models/Property");
const Inquiry = require("../models/Inquiry");
const Booking = require("../models/Booking");
const C = require("../utils/propertyConstants");
const asyncHandler = require("../utils/asyncHandler");
const { contentChanged, statusAfterEdit, checkLandlordStatusChange } = require("../utils/propertyRules");
const { saveValidatedImages, cleanupUnreferencedUploads } = require("../utils/uploadImages");

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const STALE = "This listing was changed by someone else while you were editing. Reload it and try again.";

// Ownership is enforced by the QUERY: every lookup filters on landlord = the signed-in user (req.user comes from the session).
const owned = req => ({ _id: String(req.params.id), landlord: req.user._id });
const notFound = res => res.status(404).json({ message: "Property not found." });
const validId = req => OBJECT_ID.test(String(req.params.id));

const listItem = (p, inqCount = 0) => ({
  id: String(p._id),
  title: p.title,
  area: p.area,
  city: p.city,
  rent: p.rent,
  status: p.status,
  views: p.views || 0,
  inquiries: inqCount,
  updatedAt: p.updatedAt
});

const list = asyncHandler(async (req, res) => {
  const docs = await Property.find({ landlord: req.user._id }).sort({ createdAt: -1 }).limit(200).lean();
  const ids = docs.map(d => d._id);
  const inqCounts = ids.length
    ? await Inquiry.aggregate([
      { $match: { property: { $in: ids } } },
      { $group: { _id: "$property", count: { $sum: 1 } } }
    ])
    : [];
  const countMap = new Map(inqCounts.map(r => [String(r._id), r.count]));
  res.json(docs.map(p => listItem(p, countMap.get(String(p._id)) || 0)));
});

const create = asyncHandler(async (req, res) => {
  const input = { ...req.propertyInput };
  let uploadedUrls = [];
  if (req.isMultipartListing && req.validatedImageFiles && req.validatedImageFiles.length) {
    uploadedUrls = await saveValidatedImages(req.validatedImageFiles);
    input.images = uploadedUrls;
  }
  try {
    const doc = await Property.create({
      ...input,
      landlord: req.user._id,
      status: "pending_review",
      submittedAt: new Date(),
      verified: false,
      featured: false,
      views: 0
    });
    res.status(201).json(doc.toJSON());
  } catch (err) {
    if (uploadedUrls.length) await cleanupUnreferencedUploads(Property, uploadedUrls);
    throw err;
  }
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

  if (existing.status === "booked") {
    return res.status(409).json({ message: "Cannot edit a property while it has a confirmed booking." });
  }

  const input = { ...req.propertyInput };
  let uploadedUrls = [];

  if (req.isMultipartListing) {
    const currentSet = new Set(Array.isArray(existing.images) ? existing.images : []);
    const keptExisting = req.keepExistingImages
      ? (req.existingImages || []).filter(u => currentSet.has(u))
      : [];
    const newCount = (req.validatedImageFiles || []).length;
    if (keptExisting.length + newCount > C.MAX_IMAGES) {
      const msg = `Use at most ${C.MAX_IMAGES} photos.`;
      return res.status(422).json({ message: msg, errors: { images: msg } });
    }
    if (newCount) {
      uploadedUrls = await saveValidatedImages(req.validatedImageFiles);
    }
    if (req.keepExistingImages) {
      input.images = [...keptExisting, ...uploadedUrls];
    } else if (uploadedUrls.length) {
      input.images = uploadedUrls;
    }
  }

  const changed = contentChanged(existing.toObject(), input);
  const nextStatus = statusAfterEdit(existing.status, changed);

  const updateDoc = { $set: { ...input } };
  if (nextStatus !== existing.status) {
    updateDoc.$set.status = nextStatus;
    updateDoc.$set.submittedAt = new Date();
    updateDoc.$unset = { reviewedAt: 1, reviewedBy: 1 };
  }

  let saved;
  try {
    saved = await Property.findOneAndUpdate(
      { ...owned(req), status: existing.status },
      updateDoc,
      { new: true, runValidators: true }
    );
  } catch (err) {
    if (uploadedUrls.length) await cleanupUnreferencedUploads(Property, uploadedUrls);
    throw err;
  }

  if (!saved) {
    if (uploadedUrls.length) await cleanupUnreferencedUploads(Property, uploadedUrls);
    return res.status(409).json({ message: STALE });
  }

  if (Array.isArray(existing.images)) {
    const keptSet = new Set(saved.images || []);
    const removed = existing.images.filter(u => !keptSet.has(u));
    if (removed.length) await cleanupUnreferencedUploads(Property, removed);
  }

  res.json(saved.toJSON());
});

const updateStatus = asyncHandler(async (req, res) => {
  if (!validId(req)) return notFound(res);
  const existing = await Property.findOne(owned(req));
  if (!existing) return notFound(res);

  const check = checkLandlordStatusChange(existing.status, req.newStatus);
  if (!check.ok) return res.status(409).json({ message: check.message });
  if (check.noop) return res.json(existing.toJSON());

  const saved = await Property.findOneAndUpdate(
    { ...owned(req), status: existing.status },
    { $set: { status: req.newStatus } },
    { new: true, runValidators: true }
  );
  if (!saved) return res.status(409).json({ message: STALE });
  res.json(saved.toJSON());
});

const remove = asyncHandler(async (req, res) => {
  if (!validId(req)) return notFound(res);
  const existing = await Property.findOne(owned(req)).select("_id status images").lean();
  if (!existing) return notFound(res);

  const hasConfirmed = existing.status === "booked" || await Booking.exists({ property: existing._id, status: "confirmed" });
  if (hasConfirmed) {
    return res.status(409).json({ message: "Cannot delete a property with an active confirmed booking. Cancel the booking first." });
  }

  const result = await Property.deleteOne(owned(req));
  if (!result.deletedCount) return notFound(res);
  if (Array.isArray(existing.images) && existing.images.length) {
    await cleanupUnreferencedUploads(Property, existing.images);
  }
  res.status(204).end();
});

const stats = asyncHandler(async (req, res) => {
  const [rows, propIds] = await Promise.all([
    Property.aggregate([
      { $match: { landlord: req.user._id } },
      { $group: { _id: "$status", count: { $sum: 1 }, views: { $sum: "$views" } } }
    ]),
    Property.find({ landlord: req.user._id }).distinct("_id")
  ]);
  const inquiries = propIds.length ? await Inquiry.countDocuments({ property: { $in: propIds } }) : 0;
  const by = Object.fromEntries(rows.map(r => [r._id, r]));
  res.json({
    activeListings: (by.active && by.active.count) || 0,
    pendingListings: (by.pending_review && by.pending_review.count) || 0,
    views: rows.reduce((sum, r) => sum + (r.views || 0), 0),
    inquiries
  });
});

const inquiries = asyncHandler(async (req, res) => {
  const props = await Property.find({ landlord: req.user._id }).select("_id title").lean();
  if (!props.length) return res.json({ items: [], total: 0 });
  const titleById = new Map(props.map(p => [String(p._id), p.title]));
  const docs = await Inquiry.find({ property: { $in: props.map(p => p._id) } })
    .sort({ sentAt: -1 })
    .limit(100)
    .lean();
  const items = docs.map(d => ({
    id: String(d._id),
    propertyId: String(d.property),
    propertyTitle: titleById.get(String(d.property)) || "Removed listing",
    fromName: d.name,
    phone: d.phone || "",
    message: d.message,
    status: d.status,
    sentAt: d.sentAt
  }));
  res.json({ items, total: items.length });
});

module.exports = { list, create, get, update, updateStatus, remove, stats, inquiries };
