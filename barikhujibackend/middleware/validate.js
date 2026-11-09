"use strict";
const { validationResult } = require("express-validator");

// The frontend shows only `message`, so it carries the first problem. `errors` maps field -> message for future use.
module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = {};
  for (const e of result.array({ onlyFirstError: true })) if (!errors[e.path]) errors[e.path] = e.msg;
  return res.status(422).json({ message: Object.values(errors)[0], errors });
};
