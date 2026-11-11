"use strict";
const express = require("express");
const bookingCtrl = require("../controllers/bookingController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

function createBookingsRouter() {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(requireAuth, requireRole("customer"));

  router.post("/", bookingCtrl.createBooking);
  router.post("/:id/cancel", bookingCtrl.cancelByCustomer);
  return router;
}

module.exports = { createBookingsRouter };
