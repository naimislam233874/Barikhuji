"use strict";
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");
const { buildSession } = require("./config/session");
const { dbState } = require("./config/db");
const sanitizeRequest = require("./middleware/sanitize");
const { verifyCsrf } = require("./middleware/csrf");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { UPLOAD_ROOT } = require("./utils/uploadImages");
const { createAuthRouter } = require("./routes/auth");
const { createLandlordRouter } = require("./routes/landlord");
const { createPropertyRouter } = require("./routes/properties");
const { createMeRouter } = require("./routes/me");
const { createInquiriesRouter } = require("./routes/inquiries");
const { createLocationsRouter } = require("./routes/locations");
const { createBookingsRouter } = require("./routes/bookings");
const { createChatRouter } = require("./routes/chat");
const { createAdminRouter } = require("./routes/admin");
const { createContactRouter } = require("./routes/contact");

const API_PREFIX = "/api/v1";

// Builds the Express app without starting it (so tests can import it). Requires mongoose to be connected already.
function createApp(config, { sessionStore } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(cors({
    origin(origin, callback) { callback(null, !origin || config.frontendOrigins.includes(origin)); },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", config.csrfHeader],
    maxAge: 600
  }));

  // Serve uploaded property images safely (no directory indexing).
  app.use("/uploads", express.static(UPLOAD_ROOT, { index: false, maxAge: "1d" }));

  app.use(express.json({ limit: "10kb" }));
  app.use(sanitizeRequest);

  // Health check: before the session middleware so monitoring pings never create sessions. Exposes no secrets.
  app.get(`${API_PREFIX}/health`, (req, res) => {
    const database = dbState();
    const ok = database === "connected" && mongoose.connection.readyState === 1;
    res.set("Cache-Control", "no-store").status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", database, uptimeSeconds: Math.round(process.uptime()) });
  });

  const sessionMiddleware = buildSession(config, { store: sessionStore });
  app.sessionMiddleware = sessionMiddleware;
  app.use(sessionMiddleware);

  const api = express.Router();
  api.use(verifyCsrf(config.frontendOrigins, config.csrfHeader));
  api.use("/auth", createAuthRouter(config));
  api.use("/landlord", createLandlordRouter());
  api.use("/properties", createPropertyRouter());
  api.use("/me", createMeRouter());
  api.use("/inquiries", createInquiriesRouter(config));
  api.use("/locations", createLocationsRouter());
  api.use("/bookings", createBookingsRouter());
  api.use("/chat", createChatRouter());
  api.use("/admin", createAdminRouter());
  api.use("/contact", createContactRouter(config));
  app.use(API_PREFIX, api);

  app.use(notFound);
  app.use(errorHandler(config));
  return app;
}

module.exports = { createApp, API_PREFIX };
