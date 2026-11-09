"use strict";
const express = require("express");
const createPropertyController = require("../controllers/propertyController");

// Public and read-only: no sign-in needed, GET only (so the CSRF check never applies), nothing private is returned.
// Mounted in app.js as /api/v1/properties.
function createPropertyRouter(controller = createPropertyController()) {
  const router = express.Router();
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  return router;
}

module.exports = { createPropertyRouter };
