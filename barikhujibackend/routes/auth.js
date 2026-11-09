"use strict";
const express = require("express");
const { createAuthController } = require("../controllers/authController");
const { registerRules, loginRules } = require("../validators/authValidators");
const validate = require("../middleware/validate");
const requireAuth = require("../middleware/requireAuth");
const { issueToken } = require("../middleware/csrf");
const { createRateLimiters } = require("../middleware/rateLimiters");

// Paths match what the existing frontend calls (js/api-account.js): /auth/{customer|landlord}/{login|register}, /auth/admin/login, /auth/logout.
// There is intentionally NO admin register route. Admins are created with `npm run create-admin`.
function createAuthRouter(config) {
  const router = express.Router();
  const ctrl = createAuthController(config);
  const limit = createRateLimiters(config);

  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  router.get("/csrf", issueToken);

  router.post("/customer/register", limit.register, registerRules, validate, ctrl.register("customer"));
  router.post("/landlord/register", limit.register, registerRules, validate, ctrl.register("landlord"));

  router.post("/customer/login", limit.loginIp, loginRules, validate, limit.loginEmail, ctrl.login("customer"));
  router.post("/landlord/login", limit.loginIp, loginRules, validate, limit.loginEmail, ctrl.login("landlord"));
  router.post("/admin/login", limit.loginIp, loginRules, validate, limit.loginEmail, ctrl.login("admin"));

  router.post("/logout", ctrl.logout);
  router.get("/me", requireAuth, ctrl.me);
  return router;
}

module.exports = { createAuthRouter };
