"use strict";
const express = require("express");
const { body } = require("express-validator");
const ContactMessage = require("../models/ContactMessage");
const asyncHandler = require("../utils/asyncHandler");
const validate = require("../middleware/validate");
const { createRateLimiters } = require("../middleware/rateLimiters");
const { normalizePhone, BD_INPUT } = require("../utils/phone");

function createContactRouter(config) {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const limit = createRateLimiters(config);

  const rules = [
    body("name")
      .isString().withMessage("Name is required.").bail()
      .trim()
      .isLength({ min: 2, max: 80 }).withMessage("Name must be 2 to 80 characters."),
    body("email")
      .isString().withMessage("Enter a valid email address.").bail()
      .trim().toLowerCase()
      .isLength({ max: 254 }).withMessage("Email is too long.")
      .isEmail().withMessage("Enter a valid email address."),
    body("phone")
      .optional({ values: "falsy" })
      .isString().withMessage("Enter a valid Bangladeshi mobile number.").bail()
      .trim()
      .custom(v => BD_INPUT.test(v.replace(/[\s-]/g, ""))).withMessage("Enter a valid Bangladeshi mobile number."),
    body("subject")
      .isString().withMessage("Topic is required.").bail()
      .trim()
      .isLength({ min: 2, max: 120 }).withMessage("Topic must be 2 to 120 characters."),
    body("message")
      .isString().withMessage("Message is required.").bail()
      .trim()
      .isLength({ min: 10, max: 2000 }).withMessage("Message must be 10 to 2000 characters.")
  ];

  router.post("/", limit.inquiries, rules, validate, asyncHandler(async (req, res) => {
    const doc = await ContactMessage.create({
      name: req.body.name,
      email: req.body.email,
      ...(req.body.phone ? { phone: normalizePhone(req.body.phone) } : {}),
      subject: req.body.subject,
      message: req.body.message
    });
    res.status(201).json({ id: String(doc._id), status: doc.status, createdAt: doc.createdAt });
  }));

  return router;
}

module.exports = { createContactRouter };
