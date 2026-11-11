"use strict";
const express = require("express");
const ctrl = require("../controllers/adminController");
const bookingCtrl = require("../controllers/bookingController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

function createAdminRouter() {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(requireAuth, requireRole("admin"));

  router.get("/overview", ctrl.overview);
  router.get("/properties", ctrl.listProperties);
  router.get("/properties/:id", ctrl.getProperty);
  router.post("/properties/:id/review", ctrl.reviewProperty);
  router.patch("/properties/:id/flags", ctrl.updatePropertyFlags);

  router.get("/users", ctrl.listUsers);
  router.patch("/users/:id/status", ctrl.updateUserStatus);

  router.get("/bookings", bookingCtrl.listForAdmin);
  router.post("/bookings/:id/cancel", bookingCtrl.cancelByAdmin);

  router.get("/moderation-history", ctrl.moderationHistory);
  router.get("/reports", ctrl.listReports);
  router.patch("/reports/:id", ctrl.updateReportStatus);

  return router;
}

module.exports = { createAdminRouter };
