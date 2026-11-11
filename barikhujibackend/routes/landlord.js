"use strict";
const express = require("express");
const ctrl = require("../controllers/landlordController");
const bookingCtrl = require("../controllers/bookingController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { requireJson, parseListingRequest, parseStatusBody } = require("../middleware/propertyBody");

function createLandlordRouter() {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(requireAuth, requireRole("landlord"));

  router.get("/stats", ctrl.stats);
  router.get("/inquiries", ctrl.inquiries);
  router.get("/properties", ctrl.list);
  router.post("/properties", parseListingRequest, ctrl.create);
  router.get("/properties/:id", ctrl.get);
  router.put("/properties/:id", parseListingRequest, ctrl.update);
  router.patch("/properties/:id/status", requireJson, parseStatusBody, ctrl.updateStatus);
  router.delete("/properties/:id", ctrl.remove);

  router.get("/bookings", bookingCtrl.listForLandlord);
  router.post("/bookings/:id/confirm", bookingCtrl.confirmBooking);
  router.post("/bookings/:id/reject", bookingCtrl.rejectBooking);
  router.post("/bookings/:id/cancel", bookingCtrl.cancelByLandlord);

  return router;
}

module.exports = { createLandlordRouter };
