"use strict";
const express = require("express");
const { body } = require("express-validator");
const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { createRateLimiters } = require("../middleware/rateLimiters");
const { normalizePhone, BD_INPUT } = require("../utils/phone");

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// POST /api/v1/inquiries — a signed-in customer asks about one ACTIVE listing.
// GET /api/v1/me/inquiries lives in routes/me.js; this file only creates inquiries.
// The customer comes from the session; name/phone/message come from the (validated) body.
function createInquiriesRouter(config) {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  const limit = createRateLimiters(config);

  const rules = [
    body("propertyId")
      .isString().withMessage("Property is required.").bail()
      .trim()
      .matches(OBJECT_ID).withMessage("Property not found."),
    body("name")
      .isString().withMessage("Name is required.").bail()
      .trim()
      .isLength({ min: 2, max: 80 }).withMessage("Name must be 2 to 80 characters."),
    body("phone")
      .isString().withMessage("Mobile number is required.").bail()
      .trim()
      .custom(v => BD_INPUT.test(v.replace(/[\s-]/g, ""))).withMessage("Enter a valid Bangladeshi mobile number."),
    body("message")
      .isString().withMessage("Message is required.").bail()
      .trim()
      .isLength({ min: 10, max: 1000 }).withMessage("Message must be 10 to 1000 characters."),
  ];

  router.post("/", requireAuth, requireRole("customer"), limit.inquiries, rules, validate, asyncHandler(async (req, res) => {
    const propertyId = String(req.body.propertyId);
    // Eligibility: only an active listing can be inquired about. A missing, malformed,
    // paused, pending or rejected id is the same 404, so ids cannot be probed.
    const property = await Property.findOne({ _id: propertyId, status: "active" }).select("_id").lean();
    if (!property) return res.status(404).json({ message: "Property not found." });

    const doc = await Inquiry.create({
      customer: req.user._id,          // from the session, never from the body
      property: property._id,
      name: req.body.name,
      phone: normalizePhone(req.body.phone),
      message: req.body.message,
    });
    res.status(201).json({ id: String(doc._id), status: doc.status, sentAt: doc.sentAt });
  }));

  return router;
}

module.exports = { createInquiriesRouter };
