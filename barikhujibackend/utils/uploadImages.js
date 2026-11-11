"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const C = require("./propertyConstants");

const UPLOAD_ROOT = path.resolve(__dirname, "..", "uploads");
const PROPERTIES_UPLOAD_DIR = path.join(UPLOAD_ROOT, "properties");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UPLOAD_URL_RE = /^\/uploads\/properties\/[0-9a-f-]+\.(jpg|png|webp)$/i;

/** Detect JPEG, PNG, or WebP from magic bytes; returns canonical extension or null. */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "png";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "webp";
  return null;
}

/** Validate an array of multer memory files before writing any bytes to disk. */
function validateImageFiles(files = []) {
  if (files.length > C.MAX_IMAGES) {
    return { ok: false, status: 422, message: `Use at most ${C.MAX_IMAGES} photos.` };
  }
  const validated = [];
  for (const f of files) {
    if (!ALLOWED_MIMES.has(String(f.mimetype || "").toLowerCase())) {
      return { ok: false, status: 422, message: "Only JPG, PNG or WebP images are allowed." };
    }
    if (!f.buffer || f.size > MAX_IMAGE_BYTES) {
      return { ok: false, status: 422, message: "Each photo must be 5 MB or smaller." };
    }
    const ext = detectImageType(f.buffer);
    if (!ext) {
      return { ok: false, status: 422, message: "Uploaded file is not a valid JPG, PNG or WebP image." };
    }
    validated.push({ buffer: f.buffer, ext });
  }
  return { ok: true, files: validated };
}

/** Persist validated image buffers to disk using safe random UUID filenames. */
async function saveValidatedImages(validatedFiles, uploadDir = PROPERTIES_UPLOAD_DIR) {
  if (!validatedFiles.length) return [];
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const savedUrls = [];
  for (const item of validatedFiles) {
    const filename = `${crypto.randomUUID()}.${item.ext}`;
    const dest = path.join(uploadDir, filename);
    await fs.promises.writeFile(dest, item.buffer, { flag: "wx" });
    savedUrls.push(`/uploads/properties/${filename}`);
  }
  return savedUrls;
}

/** Delete local property uploads only when no Property document references them. */
async function cleanupUnreferencedUploads(PropertyModel, removedPaths = [], uploadDir = PROPERTIES_UPLOAD_DIR) {
  const base = path.resolve(uploadDir);
  for (const p of [...new Set(removedPaths)]) {
    if (typeof p !== "string" || !UPLOAD_URL_RE.test(p)) continue;
    const filename = path.basename(p);
    const full = path.resolve(base, filename);
    if (!full.startsWith(base + path.sep)) continue;
    try {
      const stillUsed = await PropertyModel.exists({ images: p });
      if (!stillUsed) await fs.promises.unlink(full).catch(() => {});
    } catch (_) { /* cleanup failure is non-fatal */ }
  }
}

const multipartParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: C.MAX_IMAGES + 1, // allow 11th to arrive so we return clean 422 count error
    fields: 60,
    fieldSize: 64 * 1024
  }
}).array("images", C.MAX_IMAGES + 1);

module.exports = {
  UPLOAD_ROOT,
  PROPERTIES_UPLOAD_DIR,
  MAX_IMAGE_BYTES,
  ALLOWED_MIMES,
  detectImageType,
  validateImageFiles,
  saveValidatedImages,
  cleanupUnreferencedUploads,
  multipartParser
};
