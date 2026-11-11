"use strict";
const express = require("express");
const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");
const { parseLocationQuery, rankSuggestion } = require("../utils/locationMatch");

// GET /api/v1/locations?q=... -> { items: [{ name, type }] }
// Public, read-only, GET (so the CSRF check never applies). Suggestions are derived from
// the active listings in the database — area, city and the area-like words inside
// addresses — so new places appear automatically and nothing is hardcoded.
// Ranking: exact name match, then names starting with the query, then names containing it.
const MAX_SUGGESTIONS = 8;

function createLocationsRouter() {
  const router = express.Router();

  router.get("/", asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const { tokens, error } = parseLocationQuery(q);
    if (error) return res.status(422).json({ message: error, errors: { q: error } });

    const docs = await Property.find({ status: "active" }).select("area city address").lean();

    // Candidate place names with a count of active listings behind each one.
    const counts = new Map();
    for (const d of docs) {
      if (d.area) counts.set(d.area, (counts.get(d.area) || 0) + 1);
      if (d.city) counts.set(d.city, (counts.get(d.city) || 0) + 1);
      // "House 5, Road 3, Block B, Bashundhara R/A" -> the area-like tail of the address.
      const tail = typeof d.address === "string" ? d.address.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (tail.length > 1) {
        const sub = tail[tail.length - 1];
        if (sub && sub.length >= 3) counts.set(sub, (counts.get(sub) || 0) + 1);
      }
    }

    let items = [...counts.entries()]
      .map(([name, count]) => ({ name, count, rank: rankSuggestion(name, q), matched: tokens.length === 0 || tokens.every(t => name.toLowerCase().includes(t)) }))
      .filter(s => s.matched && s.rank !== 99)
      .sort((a, b) => a.rank - b.rank || b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, MAX_SUGGESTIONS)
      .map(({ name }) => ({ name, type: "area" }));

    res.set("Cache-Control", "no-store").json({ items });
  }));

  return router;
}

module.exports = { createLocationsRouter };
