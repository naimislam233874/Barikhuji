"use strict";
const { parsePropertyInput } = require("../utils/propertyInput");
const { LANDLORD_SETTABLE_STATUSES } = require("../utils/propertyConstants");

// Same error shape as the existing validate middleware: { message: <first problem>, errors: { field: message } }.
function requireJson(req, res, next) {
  const type = String(req.headers["content-type"] || "");
  if (type && !/^application\/json/i.test(type)) {
    return res.status(415).json({ message: "Send JSON with Content-Type: application/json. Photo upload (multipart) is not supported by this endpoint yet." });
  }
  next();
}

function parseListingBody(req, res, next) {
  const { value, errors } = parsePropertyInput(req.body, { requireAll: true });
  if (Object.keys(errors).length) return res.status(422).json({ message: Object.values(errors)[0], errors });
  req.propertyInput = value; // the ONLY listing data controllers read from the client
  next();
}

function parseStatusBody(req, res, next) {
  const status = req.body && typeof req.body.status === "string" ? req.body.status : "";
  if (!LANDLORD_SETTABLE_STATUSES.includes(status)) {
    const message = 'Status must be "active" or "paused".';
    return res.status(422).json({ message, errors: { status: message } });
  }
  req.newStatus = status;
  next();
}

module.exports = { requireJson, parseListingBody, parseStatusBody };
