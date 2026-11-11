"use strict";
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const ModerationLog = require("../models/ModerationLog");
const asyncHandler = require("../utils/asyncHandler");
const { isRealDate } = require("../utils/propertyInput");
const { normalizePhone, BD_INPUT } = require("../utils/phone");

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const BAD_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const todayStr = () => new Date().toISOString().slice(0, 10);

function validateBookingBody(body = {}, fallbackPhone = "") {
  const errors = {};
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  const propertyId = typeof src.propertyId === "string" ? src.propertyId.trim() : "";
  if (!OBJECT_ID.test(propertyId)) errors.propertyId = "Property not found.";

  const moveInDate = typeof src.moveInDate === "string" ? src.moveInDate.trim() : "";
  const today = todayStr();
  const maxDate = new Date();
  maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 3);
  const maxStr = maxDate.toISOString().slice(0, 10);

  if (!isRealDate(moveInDate)) {
    errors.moveInDate = "Move-in date must be a real date in YYYY-MM-DD format.";
  } else if (moveInDate < today) {
    errors.moveInDate = "Move-in date cannot be in the past.";
  } else if (moveInDate > maxStr) {
    errors.moveInDate = "Move-in date must be within the next 3 years.";
  }

  let moveOutDate;
  if (src.moveOutDate !== undefined && src.moveOutDate !== null && String(src.moveOutDate).trim() !== "") {
    if (typeof src.moveOutDate !== "string" || !isRealDate(src.moveOutDate.trim())) {
      errors.moveOutDate = "Move-out date must be a real date in YYYY-MM-DD format.";
    } else {
      moveOutDate = src.moveOutDate.trim();
      if (!errors.moveInDate && moveOutDate <= moveInDate) {
        errors.moveOutDate = "Move-out date must be after the move-in date.";
      }
    }
  }

  let phone = fallbackPhone || "";
  if (src.phone !== undefined && src.phone !== null && String(src.phone).trim() !== "") {
    if (typeof src.phone !== "string") {
      errors.phone = "Enter a valid Bangladeshi mobile number.";
    } else {
      const cleaned = src.phone.trim().replace(/[\s-]/g, "");
      if (!BD_INPUT.test(cleaned)) errors.phone = "Enter a valid Bangladeshi mobile number.";
      else phone = normalizePhone(cleaned);
    }
  }

  let message = "";
  if (src.message !== undefined && src.message !== null) {
    if (typeof src.message !== "string") errors.message = "Message must be text.";
    else {
      const m = src.message.trim();
      if (BAD_CHARS.test(m)) errors.message = "Message contains unsupported characters.";
      else if (m.length > 500) errors.message = "Message must be at most 500 characters.";
      else message = m;
    }
  }

  return {
    errors,
    value: { propertyId, moveInDate, moveOutDate, phone, message }
  };
}

function serializeBooking(b, roleView = "customer") {
  const prop = b.property && typeof b.property === "object" ? b.property : null;
  const cust = b.customer && typeof b.customer === "object" ? b.customer : null;
  const land = b.landlord && typeof b.landlord === "object" ? b.landlord : null;
  const out = {
    id: String(b._id),
    propertyId: prop ? String(prop._id) : String(b.property || ""),
    propertyTitle: prop ? prop.title : "Removed listing",
    propertyArea: prop ? prop.area : "",
    propertyCity: prop ? prop.city : "",
    propertyRent: prop ? prop.rent : 0,
    propertyStatus: prop ? prop.status : "",
    propertyImage: prop && Array.isArray(prop.images) && prop.images[0] ? prop.images[0] : "",
    moveInDate: b.moveInDate,
    moveOutDate: b.moveOutDate || "",
    message: b.message || "",
    status: b.status,
    requestedAt: b.requestedAt,
    decidedAt: b.decidedAt || null,
    cancelledAt: b.cancelledAt || null,
    rejectionReason: b.rejectionReason || "",
    history: Array.isArray(b.history) ? b.history.map(h => ({
      status: h.status,
      role: h.role,
      note: h.note || "",
      at: h.at
    })) : []
  };
  if (roleView === "landlord" || roleView === "admin") {
    out.customerName = cust ? cust.name : "Customer";
    out.customerPhone = b.phone || (cust && cust.phone) || "";
    if (roleView === "admin") {
      out.customerEmail = cust ? cust.email : "";
      out.landlordName = land ? land.name : "";
      out.landlordEmail = land ? land.email : "";
    }
  } else {
    out.landlordName = land ? land.name : "Landlord";
  }
  return out;
}

async function restorePropertyIfUnbooked(propertyId) {
  const otherConfirmed = await Booking.exists({ property: propertyId, status: "confirmed" });
  if (!otherConfirmed) {
    await Property.updateOne(
      { _id: propertyId, status: "booked" },
      { $set: { status: "active" }, $unset: { bookedAt: 1 } }
    );
  }
}

// POST /api/v1/bookings (Customer)
const createBooking = asyncHandler(async (req, res) => {
  const { errors, value } = validateBookingBody(req.body, req.user.phone || "");
  if (Object.keys(errors).length) {
    return res.status(errors.propertyId && Object.keys(errors).length === 1 ? 404 : 422)
      .json({ message: Object.values(errors)[0], errors });
  }

  const property = await Property.findById(value.propertyId).select("_id landlord status title").lean();
  if (!property || property.status !== "active") {
    return res.status(404).json({ message: "Property not found or no longer available." });
  }
  if (String(property.landlord) === String(req.user._id)) {
    return res.status(403).json({ message: "You cannot book your own property." });
  }
  if (await Booking.exists({ property: property._id, status: "confirmed" })) {
    return res.status(409).json({ message: "This property already has a confirmed booking." });
  }

  const now = new Date();
  let doc;
  try {
    doc = await Booking.create({
      property: property._id,
      customer: req.user._id,
      landlord: property.landlord,
      moveInDate: value.moveInDate,
      ...(value.moveOutDate ? { moveOutDate: value.moveOutDate } : {}),
      ...(value.phone ? { phone: value.phone } : {}),
      message: value.message,
      status: "pending",
      requestedAt: now,
      history: [{
        status: "pending",
        by: req.user._id,
        role: "customer",
        note: "Booking request submitted",
        at: now
      }]
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "You already have a pending booking request for this property." });
    }
    throw err;
  }

  const populated = await Booking.findById(doc._id)
    .populate("property", "title area city rent status images")
    .populate("landlord", "name")
    .lean();

  res.status(201).json({ booking: serializeBooking(populated, "customer") });
});

// GET /api/v1/me/bookings (Customer)
const listForCustomer = asyncHandler(async (req, res) => {
  const docs = await Booking.find({ customer: req.user._id })
    .sort({ requestedAt: -1 })
    .populate("property", "title area city rent status images")
    .populate("landlord", "name")
    .limit(100)
    .lean();
  const items = docs.map(b => serializeBooking(b, "customer"));
  res.json({ items, total: items.length });
});

// POST /api/v1/me/bookings/:id/cancel (Customer)
const cancelByCustomer = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Booking not found." });

  const existing = await Booking.findOne({ _id: id, customer: req.user._id }).lean();
  if (!existing) return res.status(404).json({ message: "Booking not found." });
  if (!["pending", "confirmed"].includes(existing.status)) {
    return res.status(409).json({ message: `Cannot cancel a booking that is already ${existing.status}.` });
  }

  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    { _id: id, customer: req.user._id, status: existing.status },
    {
      $set: { status: "cancelled", cancelledAt: now, cancelledBy: req.user._id },
      $push: { history: { status: "cancelled", by: req.user._id, role: "customer", note: "Cancelled by customer", at: now } }
    },
    { new: true }
  )
    .populate("property", "title area city rent status images")
    .populate("landlord", "name")
    .lean();

  if (!updated) return res.status(409).json({ message: "Booking status changed. Reload and try again." });
  if (existing.status === "confirmed") {
    await restorePropertyIfUnbooked(existing.property);
    if (updated.property) {
      const freshProp = await Property.findById(existing.property).select("status").lean();
      if (freshProp) updated.property.status = freshProp.status;
    }
  }
  res.json({ booking: serializeBooking(updated, "customer") });
});

// GET /api/v1/landlord/bookings (Landlord)
const listForLandlord = asyncHandler(async (req, res) => {
  const docs = await Booking.find({ landlord: req.user._id })
    .sort({ requestedAt: -1 })
    .populate("property", "title area city rent status images")
    .populate("customer", "name phone")
    .limit(150)
    .lean();
  const items = docs.map(b => serializeBooking(b, "landlord"));
  const pendingCount = items.filter(i => i.status === "pending").length;
  const confirmedCount = items.filter(i => i.status === "confirmed").length;
  res.json({ items, total: items.length, pendingCount, confirmedCount });
});

// POST /api/v1/landlord/bookings/:id/confirm (Landlord)
const confirmBooking = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Booking not found." });

  const existing = await Booking.findOne({ _id: id, landlord: req.user._id }).lean();
  if (!existing) return res.status(404).json({ message: "Booking not found." });
  if (existing.status !== "pending") {
    return res.status(409).json({ message: "Only pending booking requests can be confirmed." });
  }

  if (await Booking.exists({ property: existing.property, status: "confirmed" })) {
    return res.status(409).json({ message: "This property already has a confirmed booking." });
  }

  const now = new Date();
  let confirmed;
  try {
    confirmed = await Booking.findOneAndUpdate(
      { _id: id, landlord: req.user._id, status: "pending" },
      {
        $set: { status: "confirmed", decidedAt: now, decidedBy: req.user._id },
        $push: { history: { status: "confirmed", by: req.user._id, role: "landlord", note: "Confirmed by landlord", at: now } }
      },
      { new: true }
    );
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "This property already has a confirmed booking." });
    }
    throw err;
  }
  if (!confirmed) {
    return res.status(409).json({ message: "Booking status changed. Reload and try again." });
  }

  // Atomically mark property as booked ONLY if it is currently active.
  const lockedProp = await Property.findOneAndUpdate(
    { _id: existing.property, landlord: req.user._id, status: "active" },
    { $set: { status: "booked", bookedAt: now } },
    { new: true }
  );

  if (!lockedProp) {
    // Compensating rollback: property wasn't active (e.g., paused/rejected/already booked).
    await Booking.updateOne(
      { _id: confirmed._id, status: "confirmed" },
      {
        $set: { status: "pending" },
        $unset: { decidedAt: 1, decidedBy: 1 },
        $push: { history: { status: "pending", by: req.user._id, role: "system", note: "Rollback: property unavailable", at: new Date() } }
      }
    );
    return res.status(409).json({ message: "This property is not currently active and available for booking." });
  }

  const populated = await Booking.findById(confirmed._id)
    .populate("property", "title area city rent status images")
    .populate("customer", "name phone")
    .lean();

  res.json({ booking: serializeBooking(populated, "landlord"), propertyStatus: lockedProp.status });
});

// POST /api/v1/landlord/bookings/:id/reject (Landlord)
const rejectBooking = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Booking not found." });

  const reason = req.body && typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
  if (BAD_CHARS.test(reason)) return res.status(422).json({ message: "Rejection reason contains unsupported characters." });

  const existing = await Booking.findOne({ _id: id, landlord: req.user._id }).lean();
  if (!existing) return res.status(404).json({ message: "Booking not found." });
  if (existing.status !== "pending") {
    return res.status(409).json({ message: "Only pending booking requests can be rejected." });
  }

  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    { _id: id, landlord: req.user._id, status: "pending" },
    {
      $set: { status: "rejected", decidedAt: now, decidedBy: req.user._id, rejectionReason: reason },
      $push: { history: { status: "rejected", by: req.user._id, role: "landlord", note: reason || "Rejected by landlord", at: now } }
    },
    { new: true }
  )
    .populate("property", "title area city rent status images")
    .populate("customer", "name phone")
    .lean();

  if (!updated) return res.status(409).json({ message: "Booking status changed. Reload and try again." });
  res.json({ booking: serializeBooking(updated, "landlord") });
});

// POST /api/v1/landlord/bookings/:id/cancel (Landlord cancels a confirmed booking)
const cancelByLandlord = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Booking not found." });

  const reason = req.body && typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
  if (BAD_CHARS.test(reason)) return res.status(422).json({ message: "Reason contains unsupported characters." });

  const existing = await Booking.findOne({ _id: id, landlord: req.user._id }).lean();
  if (!existing) return res.status(404).json({ message: "Booking not found." });
  if (existing.status !== "confirmed") {
    return res.status(409).json({ message: "Only confirmed bookings can be cancelled here." });
  }

  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    { _id: id, landlord: req.user._id, status: "confirmed" },
    {
      $set: { status: "cancelled", cancelledAt: now, cancelledBy: req.user._id, rejectionReason: reason },
      $push: { history: { status: "cancelled", by: req.user._id, role: "landlord", note: reason || "Cancelled by landlord", at: now } }
    },
    { new: true }
  )
    .populate("property", "title area city rent status images")
    .populate("customer", "name phone")
    .lean();

  if (!updated) return res.status(409).json({ message: "Booking status changed. Reload and try again." });
  await restorePropertyIfUnbooked(existing.property);
  if (updated.property) {
    const freshProp = await Property.findById(existing.property).select("status").lean();
    if (freshProp) updated.property.status = freshProp.status;
  }
  res.json({ booking: serializeBooking(updated, "landlord") });
});

// GET /api/v1/admin/bookings (Admin)
const listForAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (typeof req.query.status === "string" && Booking.STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const docs = await Booking.find(filter)
    .sort({ requestedAt: -1 })
    .populate("property", "title area city rent status images")
    .populate("customer", "name email phone")
    .populate("landlord", "name email")
    .limit(200)
    .lean();
  const items = docs.map(b => serializeBooking(b, "admin"));
  res.json({ items, total: items.length });
});

// POST /api/v1/admin/bookings/:id/cancel (Admin)
const cancelByAdmin = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!OBJECT_ID.test(id)) return res.status(404).json({ message: "Booking not found." });

  const reason = req.body && typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
  const existing = await Booking.findById(id).lean();
  if (!existing) return res.status(404).json({ message: "Booking not found." });
  if (!["pending", "confirmed"].includes(existing.status)) {
    return res.status(409).json({ message: `Cannot cancel a booking that is already ${existing.status}.` });
  }

  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    { _id: id, status: existing.status },
    {
      $set: { status: "cancelled", cancelledAt: now, cancelledBy: req.user._id, rejectionReason: reason },
      $push: { history: { status: "cancelled", by: req.user._id, role: "admin", note: reason || "Cancelled by admin", at: now } }
    },
    { new: true }
  )
    .populate("property", "title area city rent status images")
    .populate("customer", "name email phone")
    .populate("landlord", "name email")
    .lean();

  if (!updated) return res.status(409).json({ message: "Booking status changed. Reload and try again." });
  if (existing.status === "confirmed") {
    await restorePropertyIfUnbooked(existing.property);
    if (updated.property) {
      const freshProp = await Property.findById(existing.property).select("status").lean();
      if (freshProp) updated.property.status = freshProp.status;
    }
  }

  await ModerationLog.create({
    admin: req.user._id,
    targetType: "booking",
    targetId: existing._id,
    targetLabel: updated.property ? updated.property.title : String(existing.property),
    action: "booking_cancelled",
    previousStatus: existing.status,
    newStatus: "cancelled",
    note: reason || "Cancelled by administrator"
  });

  res.json({ booking: serializeBooking(updated, "admin") });
});

module.exports = {
  createBooking,
  listForCustomer,
  cancelByCustomer,
  listForLandlord,
  confirmBooking,
  rejectBooking,
  cancelByLandlord,
  listForAdmin,
  cancelByAdmin,
  restorePropertyIfUnbooked
};
