"use strict";
const rateLimit = require("express-rate-limit");

// In-memory counters: fine for one server process. With several instances, switch to a shared store (e.g. rate-limit-mongo/redis).
function make({ windowMs, max, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs, limit: max, skipSuccessfulRequests,
    standardHeaders: "draft-7", legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    message: { message: "Too many attempts. Please wait a few minutes and try again." }
  });
}

function createRateLimiters(config) {
  const { windowMs, loginIpMax, loginEmailMax, registerMax } = config.rateLimit;
  return {
    register: make({ windowMs: 60 * 60 * 1000, max: registerMax }),
    loginIp: make({ windowMs, max: loginIpMax, skipSuccessfulRequests: true }),
    // Per target account, so one attacker cannot hammer a single email from many IPs. Runs AFTER validation (email is normalised).
    loginEmail: make({
      windowMs, max: loginEmailMax, skipSuccessfulRequests: true,
      keyGenerator: req => "email:" + (typeof req.body.email === "string" ? req.body.email.toLowerCase() : "none")
    })
  };
}

module.exports = { createRateLimiters };
