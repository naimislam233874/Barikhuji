"use strict";
const User = require("../models/User");
const Property = require("../models/Property");
const Booking = require("../models/Booking");
const ContactMessage = require("../models/ContactMessage");
const ModerationLog = require("../models/ModerationLog");
const C = require("../utils/propertyConstants");
const asyncHandler = require("../utils/asyncHandler");

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// GET /api/v1/admin/overview
const overview = asyncHandler(async (req, res) => {
  const [usersCount, landlordsCount, activeListings, pendingReviews, openReports, pendingDocs, userDocs] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "landlord" }),
    Property.countDocuments({ status: "active" }),
    Property.countDocuments({ status: "pending_review" }),
    ContactMessage.countDocuments({ status: "open" }),
    Property.find({ status: "pending_review" })
      .sort({ submittedAt: 1, createdAt: 1 })
      .populate("landlord", "name email status")
      .limit(100)
      .lean(),
    User.find()
      .sort({ createdAt: -1 })
      .select("name email phone role status createdAt lastLoginAt")
      .limit(200)
      .lean()
  ]);

  res.json({
    stats: {
      users: usersCount,
      landlords: landlordsCount,
      activeListings,
      pendingReviews,
      openReports
    },
    pending: pendingDocs.map(p => ({
      id: String(p._id),
      title: p.title,
      area: p.area,
      city: p.city,
      rent: p.rent,
      landlordName: p.landlord && p.landlord.name ? p.landlord.name : "Landlord",
      submittedAt: p.submittedAt || p.createdAt
    })),
    users: userDocs.map(u => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      role: u.role,
      status: u.status,
      createdAt: u.createdAt
    }))
  });
});

// GET /api/v1/admin/properties (includes booked properties)
const listProperties = asyncHandler(async (req, res) => {
  const filter = {};
  if (typeof req.query.status === "string" && C.STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const docs = await Property.find(filter)
    .sort({ createdAt: -1 })
    .populate("landlord", "name email phone status")
    .populate("reviewedBy", "name email")
    .limit(200)
    .lean();

  const bookedIds = docs.filter(d => d.status === "booked").map(d => d._id);
  const confirmedBookings = bookedIds.length
    ? await Booking.find({ property: { $in: bookedIds }, status: "confirmed" })
      .populate("customer", "name email phone")
      .lean()
    : [];
  const bookingByProp = new Map(confirmedBookings.map(b => [String(b.property), b]));

  const items = docs.map(p => {
    const b = bookingByProp.get(String(p._id));
    return {
      id: String(p._id),
      title: p.title,
      type: p.type,
      city: p.city,
      area: p.area,
      rent: p.rent,
      status: p.status,
      verified: !!p.verified,
      featured: !!p.featured,
      views: p.views || 0,
      images: Array.isArray(p.images) ? p.images : [],
      submittedAt: p.submittedAt,
      reviewedAt: p.reviewedAt || null,
      bookedAt: p.bookedAt || null,
      landlord: p.landlord ? {
        id: String(p.landlord._id),
        name: p.landlord.name,
        email: p.landlord.email,
        status: p.landlord.status
      } : null,
      activeBooking: b ? {
        id: String(b._id),
        moveInDate: b.moveInDate,
        customerName: b.customer ? b.customer.name : "Customer",
        customerEmail: b.customer ? b.customer.email : ""
      } : null
    };
  });

  res.json({ items, total: items.length });
});

// GET /api/v1/admin/properties/:id
const getProperty = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Property not found." });

  const p = await Property.findById(id)
    .populate("landlord", "name email phone status")
    .populate("reviewedBy", "name email")
    .lean();
  if (!p) return res.status(404).json({ message: "Property not found." });

  const bookings = await Booking.find({ property: p._id })
    .sort({ requestedAt: -1 })
    .populate("customer", "name email phone")
    .limit(20)
    .lean();

  res.json({
    id: String(p._id),
    title: p.title,
    description: p.description,
    type: p.type,
    furnished: p.furnished,
    city: p.city,
    area: p.area,
    address: p.address || "",
    rent: p.rent,
    deposit: p.deposit,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    availableFrom: p.availableFrom,
    suitableFor: p.suitableFor || [],
    amenities: p.amenities || [],
    images: p.images || [],
    status: p.status,
    verified: !!p.verified,
    featured: !!p.featured,
    views: p.views || 0,
    submittedAt: p.submittedAt,
    reviewedAt: p.reviewedAt || null,
    bookedAt: p.bookedAt || null,
    landlord: p.landlord ? {
      id: String(p.landlord._id),
      name: p.landlord.name,
      email: p.landlord.email,
      phone: p.landlord.phone || "",
      status: p.landlord.status
    } : null,
    bookings: bookings.map(b => ({
      id: String(b._id),
      status: b.status,
      moveInDate: b.moveInDate,
      moveOutDate: b.moveOutDate || "",
      customerName: b.customer ? b.customer.name : "Customer",
      customerEmail: b.customer ? b.customer.email : "",
      requestedAt: b.requestedAt
    }))
  });
});

// POST /api/v1/admin/properties/:id/review
const reviewProperty = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Property not found." });

  const src = req.body && typeof req.body === "object" ? req.body : {};
  const decision = typeof src.decision === "string" ? src.decision.trim() : "";
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(422).json({ message: 'Decision must be "approved" or "rejected".', errors: { decision: 'Decision must be "approved" or "rejected".' } });
  }
  const note = typeof src.note === "string" ? src.note.trim().slice(0, 500) : "";

  const existing = await Property.findById(id).lean();
  if (!existing) return res.status(404).json({ message: "Property not found." });
  if (existing.status === "booked") {
    return res.status(409).json({ message: "Booked listings cannot be reviewed while a confirmed booking is active." });
  }

  const nextStatus = decision === "approved" ? "active" : "rejected";
  const updates = {
    status: nextStatus,
    reviewedAt: new Date(),
    reviewedBy: req.user._id
  };
  if (typeof src.verified === "boolean") updates.verified = src.verified;
  else if (decision === "approved") updates.verified = true;
  if (typeof src.featured === "boolean") updates.featured = src.featured;

  const saved = await Property.findOneAndUpdate(
    { _id: id, status: existing.status },
    { $set: updates },
    { new: true }
  );
  if (!saved) return res.status(409).json({ message: "Listing changed while reviewing. Reload and try again." });

  await ModerationLog.create({
    admin: req.user._id,
    targetType: "property",
    targetId: existing._id,
    targetLabel: existing.title,
    action: decision === "approved" ? "property_approved" : "property_rejected",
    previousStatus: existing.status,
    newStatus: nextStatus,
    note
  });

  res.json({ property: saved.toJSON(), decision });
});

// PATCH /api/v1/admin/properties/:id/flags
const updatePropertyFlags = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Property not found." });
  const src = req.body && typeof req.body === "object" ? req.body : {};
  const set = {};
  if (typeof src.verified === "boolean") set.verified = src.verified;
  if (typeof src.featured === "boolean") set.featured = src.featured;
  if (!Object.keys(set).length) {
    return res.status(422).json({ message: "Provide verified or featured boolean flag." });
  }

  const saved = await Property.findByIdAndUpdate(id, { $set: set }, { new: true });
  if (!saved) return res.status(404).json({ message: "Property not found." });

  await ModerationLog.create({
    admin: req.user._id,
    targetType: "property",
    targetId: saved._id,
    targetLabel: saved.title,
    action: "property_flags_updated",
    previousStatus: saved.status,
    newStatus: saved.status,
    note: Object.entries(set).map(([k, v]) => `${k}=${v}`).join(", ")
  });

  res.json({ property: saved.toJSON() });
});

// GET /api/v1/admin/users
const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (typeof req.query.role === "string" && User.ROLES.includes(req.query.role)) filter.role = req.query.role;
  if (typeof req.query.status === "string" && User.STATUSES.includes(req.query.status)) filter.status = req.query.status;

  const docs = await User.find(filter)
    .sort({ createdAt: -1 })
    .select("name email phone role status createdAt lastLoginAt")
    .limit(200)
    .lean();

  res.json({
    items: docs.map(u => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt || null
    })),
    total: docs.length
  });
});

// PATCH /api/v1/admin/users/:id/status
const updateUserStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "User not found." });

  const src = req.body && typeof req.body === "object" ? req.body : {};
  const nextStatus = typeof src.status === "string" ? src.status.trim() : "";
  if (!User.STATUSES.includes(nextStatus)) {
    return res.status(422).json({ message: `Status must be one of: ${User.STATUSES.join(", ")}.`, errors: { status: "Invalid status." } });
  }
  const note = typeof src.note === "string" ? src.note.trim().slice(0, 500) : "";

  if (id === String(req.user._id)) {
    return res.status(409).json({ message: "You cannot change your own account status." });
  }

  const existing = await User.findById(id).lean();
  if (!existing) return res.status(404).json({ message: "User not found." });

  if (existing.role === "admin" && nextStatus === "suspended") {
    return res.status(409).json({ message: "Administrator accounts cannot be suspended via this endpoint." });
  }

  const updated = await User.findByIdAndUpdate(id, { $set: { status: nextStatus } }, { new: true });

  await ModerationLog.create({
    admin: req.user._id,
    targetType: "user",
    targetId: existing._id,
    targetLabel: `${existing.name} (${existing.email})`,
    action: "user_status_changed",
    previousStatus: existing.status,
    newStatus: nextStatus,
    note
  });

  res.json({ user: updated.toJSON() });
});

// GET /api/v1/admin/moderation-history
const moderationHistory = asyncHandler(async (req, res) => {
  const docs = await ModerationLog.find()
    .sort({ createdAt: -1 })
    .populate("admin", "name email")
    .limit(200)
    .lean();

  res.json({
    items: docs.map(d => ({
      id: String(d._id),
      adminName: d.admin && d.admin.name ? d.admin.name : "Admin",
      targetType: d.targetType,
      targetId: String(d.targetId),
      targetLabel: d.targetLabel || "",
      action: d.action,
      previousStatus: d.previousStatus || "",
      newStatus: d.newStatus || "",
      note: d.note || "",
      createdAt: d.createdAt
    })),
    total: docs.length
  });
});

// GET /api/v1/admin/reports
const listReports = asyncHandler(async (req, res) => {
  const docs = await ContactMessage.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({
    items: docs.map(d => ({
      id: String(d._id),
      name: d.name,
      email: d.email,
      phone: d.phone || "",
      subject: d.subject,
      message: d.message,
      status: d.status,
      createdAt: d.createdAt
    })),
    total: docs.length
  });
});

// PATCH /api/v1/admin/reports/:id
const updateReportStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Report not found." });
  const status = req.body && typeof req.body.status === "string" ? req.body.status.trim() : "";
  if (!["open", "resolved"].includes(status)) {
    return res.status(422).json({ message: 'Status must be "open" or "resolved".' });
  }
  const existing = await ContactMessage.findById(id).lean();
  if (!existing) return res.status(404).json({ message: "Report not found." });
  const updated = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();

  await ModerationLog.create({
    admin: req.user._id,
    targetType: "contact",
    targetId: existing._id,
    targetLabel: existing.subject,
    action: "report_status_changed",
    previousStatus: existing.status,
    newStatus: status
  });

  res.json({ report: { id: String(updated._id), status: updated.status } });
});

module.exports = {
  overview,
  listProperties,
  getProperty,
  reviewProperty,
  updatePropertyFlags,
  listUsers,
  updateUserStatus,
  moderationHistory,
  listReports,
  updateReportStatus
};
