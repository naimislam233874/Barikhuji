"use strict";
const express = require("express");
const ctrl = require("../controllers/landlordController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { requireJson, parseListingBody, parseStatusBody } = require("../middleware/propertyBody");

// Paths match js/api-account.js. Mounted in app.js under the API router, so the global CSRF check covers every write.
// Order matters: sign-in, then role, then (per route) content type, then validation, then the handler.
function createLandlordRouter() {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(requireAuth, requireRole("landlord"));

  router.get("/stats", ctrl.stats);
  router.get("/properties", ctrl.list);
  router.post("/properties", requireJson, parseListingBody, ctrl.create);
  router.get("/properties/:id", ctrl.get);
  router.put("/properties/:id", requireJson, parseListingBody, ctrl.update);
  router.patch("/properties/:id/status", requireJson, parseStatusBody, ctrl.updateStatus);
  router.delete("/properties/:id", ctrl.remove);
  return router;
}

module.exports = { createLandlordRouter };
