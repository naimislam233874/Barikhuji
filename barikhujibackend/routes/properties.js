"use strict";
const express = require("express");
const createPropertyController = require("../controllers/propertyController");
const requireAuth = require("../middleware/requireAuth");

const noStore = (req, res, next) => { res.set("Cache-Control", "no-store"); next(); };

// Public browse/detail are read-only (no sign-in needed); /:id/contact requires an authenticated session.
// Mounted in app.js as /api/v1/properties.
function createPropertyRouter(controller = createPropertyController()) {
  const router = express.Router();
  router.get("/", controller.list);
  if (typeof controller.contact === "function") {
    router.get("/:id/contact", requireAuth, noStore, controller.contact);
  }
  router.get("/:id", controller.get);
  return router;
}

module.exports = { createPropertyRouter };
