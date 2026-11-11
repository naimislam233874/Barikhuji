"use strict";
const multer = require("multer");
const C = require("../utils/propertyConstants");
const { parsePropertyInput, isAllowedImage } = require("../utils/propertyInput");
const { stripOperatorKeys } = require("../utils/sanitize");
const { multipartParser, validateImageFiles } = require("../utils/uploadImages");

const err422 = (res, field, message) => res.status(422).json({ message, errors: { [field]: message } });

// Kept for status PATCH and any JSON-only routes.
function requireJson(req, res, next) {
  const type = String(req.headers["content-type"] || "");
  if (type && !/^application\/json/i.test(type)) {
    return res.status(415).json({ message: "Send JSON with Content-Type: application/json." });
  }
  next();
}

function parseListingBody(req, res, next) {
  const { value, errors } = parsePropertyInput(req.body, { requireAll: true });
  if (Object.keys(errors).length) return res.status(422).json({ message: Object.values(errors)[0], errors });
  req.propertyInput = value;
  next();
}

const asStringArray = v => (Array.isArray(v) ? v.filter(x => typeof x === "string") : typeof v === "string" && v ? [v] : []);

// Accepts either application/json OR multipart/form-data (with up to 10 validated images).
function parseListingRequest(req, res, next) {
  const type = String(req.headers["content-type"] || "");
  if (!type || /^application\/json/i.test(type)) {
    req.isMultipartListing = false;
    return parseListingBody(req, res, next);
  }
  if (!/^multipart\/form-data/i.test(type)) {
    return res.status(415).json({ message: "Send JSON (application/json) or multipart form data (multipart/form-data)." });
  }

  req.isMultipartListing = true;
  multipartParser(req, res, err => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return err422(res, "images", "Each photo must be 5 MB or smaller.");
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return err422(res, "images", `Use at most ${C.MAX_IMAGES} photos.`);
        }
        return err422(res, "images", "Invalid photo upload.");
      }
      return next(err);
    }

    stripOperatorKeys(req.body);
    const src = req.body && typeof req.body === "object" ? req.body : {};
    const normalized = { ...src };
    if ("suitableFor" in src) normalized.suitableFor = asStringArray(src.suitableFor);
    if ("amenities" in src) normalized.amenities = asStringArray(src.amenities);

    // Keep track of explicit existingImages sent during edits, before removing from propertyInput.
    const hasKeepFlag = src.keepExistingImages === "1" || src.keepExistingImages === "true";
    const hasExistingField = Object.prototype.hasOwnProperty.call(src, "existingImages");
    let existingImages = hasExistingField ? asStringArray(src.existingImages) : undefined;
    delete normalized.existingImages;
    delete normalized.keepExistingImages;
    delete normalized.images;

    if (existingImages !== undefined) {
      existingImages = [...new Set(existingImages)];
      if (!existingImages.every(isAllowedImage)) {
        return err422(res, "images", "Each photo must be an https:// URL or an /uploads/ path.");
      }
      if (existingImages.length > C.MAX_IMAGES) {
        return err422(res, "images", `Use at most ${C.MAX_IMAGES} photos.`);
      }
    }

    const { value, errors } = parsePropertyInput(normalized, { requireAll: true });
    if (Object.keys(errors).length) {
      return res.status(422).json({ message: Object.values(errors)[0], errors });
    }

    const filesCheck = validateImageFiles(req.files || []);
    if (!filesCheck.ok) {
      return err422(res, "images", filesCheck.message);
    }

    const totalCount = (existingImages ? existingImages.length : 0) + filesCheck.files.length;
    if (totalCount > C.MAX_IMAGES) {
      return err422(res, "images", `Use at most ${C.MAX_IMAGES} photos.`);
    }

    req.propertyInput = value;
    req.validatedImageFiles = filesCheck.files;
    req.keepExistingImages = hasKeepFlag || hasExistingField;
    req.existingImages = existingImages || [];
    next();
  });
}

function parseStatusBody(req, res, next) {
  const status = req.body && typeof req.body.status === "string" ? req.body.status : "";
  if (!C.LANDLORD_SETTABLE_STATUSES.includes(status)) {
    const message = 'Status must be "active" or "paused".';
    return res.status(422).json({ message, errors: { status: message } });
  }
  req.newStatus = status;
  next();
}

module.exports = { requireJson, parseListingBody, parseListingRequest, parseStatusBody };
