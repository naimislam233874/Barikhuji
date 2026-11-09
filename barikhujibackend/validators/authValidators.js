"use strict";
const { body } = require("express-validator");
const { BD_INPUT } = require("../utils/phone");
const { checkPassword } = require("../utils/passwordPolicy");

// isString() runs first with bail(), so objects such as {"$gt": ""} are rejected before any sanitizer or query sees them.
const email = body("email")
  .isString().withMessage("Enter a valid email address.").bail()
  .trim().toLowerCase()
  .isLength({ max: 254 }).withMessage("Email is too long.")
  .isEmail().withMessage("Enter a valid email address.");

const registerRules = [
  body("fullName")
    .isString().withMessage("Full name is required.").bail()
    .trim()
    .isLength({ min: 3, max: 80 }).withMessage("Full name must be 3 to 80 characters.")
    .matches(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u).withMessage("Full name may only contain letters, spaces, dots, apostrophes and hyphens."),
  email,
  body("phone")
    .isString().withMessage("Mobile number is required.").bail()
    .trim()
    .custom(v => BD_INPUT.test(v.replace(/[\s-]/g, ""))).withMessage("Enter a valid Bangladeshi mobile number."),
  body("password")
    .isString().withMessage("Password is required.").bail()
    .custom((value, { req }) => {
      const r = checkPassword(value, { email: req.body.email });
      if (!r.ok) throw new Error(r.message);
      return true;
    })
  // NOTE: "role" is deliberately absent. The role comes from the route (/customer/... or /landlord/...), never from the request body.
];

const loginRules = [
  email,
  body("password")
    .isString().withMessage("Password is required.").bail()
    .isLength({ min: 1, max: 200 }).withMessage("Password is required.")
];

module.exports = { registerRules, loginRules };
