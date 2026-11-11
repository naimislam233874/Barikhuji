"use strict";
// Turns the public search query string (req.query) into a safe MongoDB filter, sort and page.
// Pure (no dependencies). Matches the parameters js/api.js already sends:
//   location, minRent, maxRent, type, suitableFor, bedrooms, bathrooms, furnished, availableFrom,
//   amenities (comma separated), featured, sort (rentAsc | rentDesc | newest), page, limit.
// Safety rules:
//   * `status: "active"` is ALWAYS in the filter and can never come from the client.
//   * Every value must be a single string. Arrays and objects (?type[$ne]=x, ?type=a&type=b) are rejected.
//   * Enum values are matched against fixed lists. Numbers are digits only. Dates must be real dates.
//   * Search text is escaped before it becomes a regular expression, so ".*" or "(a+)+$" are plain text.
const C = require("./propertyConstants");
const { isRealDate } = require("./propertyInput");
const { parseLocationQuery } = require("./locationMatch");

const DEFAULT_LIMIT = 12, MAX_LIMIT = 50, MAX_PAGE = 500;
const DEFAULT_SORT = Object.freeze({ featured: -1, createdAt: -1, _id: -1 });
// _id is the tie-breaker, so paging through equal rents or dates never repeats or skips a listing.
const SORTS = Object.freeze({
  rentAsc: Object.freeze({ rent: 1, _id: 1 }),
  rentDesc: Object.freeze({ rent: -1, _id: -1 }),
  newest: Object.freeze({ createdAt: -1, _id: -1 })
});

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canonical = (list, value) => list.find(x => x.toLowerCase() === value.toLowerCase());

function parsePropertyQuery(query) {
  const q = query && typeof query === "object" ? query : {};
  const errors = {};
  const filter = { status: "active" };

  // A parameter is "absent" when missing or blank (the browse form sends empty strings). Anything but a string is an error.
  const single = key => {
    const v = q[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string") { errors[key] = `${key} must be a single value.`; return undefined; }
    const t = v.trim();
    return t === "" ? undefined : t;
  };

  // location: flexible matching over area, city and address (see utils/locationMatch.js).
  // Every meaningful word must appear somewhere in those fields, so "Mirpur, Dhaka" needs
  // both words, "Bad" matches "Badda" (prefix), and "Gulshan" matches "Gulshan 2".
  // Single characters are dropped ("Gulshan 1" still finds "Gulshan 2" through "gulshan"),
  // and regex text is escaped, so ".*" or "(a+)+$" are plain text.
  const location = single("location");
  if (location !== undefined) {
    const { tokens: locTokens, error } = parseLocationQuery(location);
    if (error) errors.location = error;
    else if (locTokens.length) {
      const parts = locTokens.map(t => { const rx = new RegExp(escapeRegex(t), "i"); return { $or: [{ area: rx }, { city: rx }, { address: rx }] }; });
      filter.$and = parts;
    }
  }

  const whole = (key, label, max) => {
    const v = single(key);
    if (v === undefined) return undefined;
    if (!/^\d{1,9}$/.test(v) || Number(v) > max) { errors[key] = `${label} must be a whole number${max < 1e9 ? ` from 0 to ${max}` : ""}.`; return undefined; }
    return Number(v);
  };

  const minRent = whole("minRent", "Minimum rent", 1e9), maxRent = whole("maxRent", "Maximum rent", 1e9);
  if (minRent !== undefined && maxRent !== undefined && minRent > maxRent) errors.minRent = "Minimum rent cannot be higher than maximum rent.";
  if (minRent !== undefined || maxRent !== undefined) {
    filter.rent = {};
    if (minRent !== undefined) filter.rent.$gte = minRent;
    if (maxRent !== undefined) filter.rent.$lte = maxRent;
  }

  const oneOf = (key, label, list) => {
    const v = single(key);
    if (v === undefined) return undefined;
    const hit = canonical(list, v);
    if (!hit) errors[key] = `${label} must be one of: ${list.join(", ")}.`;
    return hit;
  };
  const type = oneOf("type", "Type", C.PROPERTY_TYPES); if (type) filter.type = type;
  const suitable = oneOf("suitableFor", "Suitable for", C.SUITABLE_FOR); if (suitable) filter.suitableFor = suitable; // array contains
  const furnished = oneOf("furnished", "Furnished status", C.FURNISHED); if (furnished) filter.furnished = furnished;

  // "at least N", as in the frontend filter. 0 means "any".
  const beds = whole("bedrooms", "Bedrooms", 10); if (beds) filter.bedrooms = { $gte: beds };
  const baths = whole("bathrooms", "Bathrooms", 10); if (baths) filter.bathrooms = { $gte: baths };

  // "Available by": listings that are free on or before this date. availableFrom is stored as YYYY-MM-DD text.
  const availableFrom = single("availableFrom");
  if (availableFrom !== undefined) {
    if (!isRealDate(availableFrom)) errors.availableFrom = "Available by must be a real date in YYYY-MM-DD format.";
    else filter.availableFrom = { $lte: availableFrom };
  }

  const amenitiesRaw = single("amenities");
  if (amenitiesRaw !== undefined) {
    const names = [...new Set(amenitiesRaw.split(",").map(s => s.trim()).filter(Boolean))];
    const mapped = names.map(n => canonical(C.AMENITIES, n));
    if (!names.length || mapped.some(m => !m)) errors.amenities = `Amenities must be a comma-separated list of: ${C.AMENITIES.join(", ")}.`;
    else filter.amenities = { $all: mapped };
  }

  const featured = single("featured");
  if (featured !== undefined) {
    if (["1", "true"].includes(featured.toLowerCase())) filter.featured = true;
    else if (!["0", "false"].includes(featured.toLowerCase())) errors.featured = "Featured must be 1 or 0.";
  }

  let sort = { ...DEFAULT_SORT };   // copies: Mongoose must never receive (and possibly modify) the shared frozen objects
  const sortKey = single("sort");
  if (sortKey !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(SORTS, sortKey)) errors.sort = "Sort must be rentAsc, rentDesc or newest.";
    else sort = { ...SORTS[sortKey] };
  }

  let page = 1, limit = DEFAULT_LIMIT;
  const pageRaw = single("page");
  if (pageRaw !== undefined) {
    if (!/^\d{1,4}$/.test(pageRaw) || Number(pageRaw) < 1 || Number(pageRaw) > MAX_PAGE) errors.page = `Page must be a whole number from 1 to ${MAX_PAGE}.`;
    else page = Number(pageRaw);
  }
  const limitRaw = single("limit");
  if (limitRaw !== undefined) {
    if (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > MAX_LIMIT) errors.limit = `Limit must be a whole number from 1 to ${MAX_LIMIT}.`;
    else limit = Number(limitRaw);
  }

  return { filter, sort, page, limit, errors };
}

module.exports = { parsePropertyQuery, escapeRegex, DEFAULT_LIMIT, MAX_LIMIT, MAX_PAGE };
