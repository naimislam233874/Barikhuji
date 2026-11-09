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
const { createAuthRouter } = require("./routes/auth");
const { createLandlordRouter } = require("./routes/landlord");

const API_PREFIX = "/api/v1";

// Builds the Express app without starting it (so tests can import it). Requires mongoose to be connected already.
function createApp(config, { sessionStore } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  app.use(cors({
    origin(origin, callback) { callback(null, !origin || config.frontendOrigins.includes(origin)); },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", config.csrfHeader],
    maxAge: 600
  }));
  app.use(express.json({ limit: "10kb" }));
  app.use(sanitizeRequest);

  // Health check: before the session middleware so monitoring pings never create sessions. Exposes no secrets.
  app.get(`${API_PREFIX}/health`, (req, res) => {
    const database = dbState();
    const ok = database === "connected" && mongoose.connection.readyState === 1;
    res.set("Cache-Control", "no-store").status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", database, uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use(buildSession(config, { store: sessionStore }));

const api = express.Router();
api.use(verifyCsrf(config.frontendOrigins, config.csrfHeader));
api.use("/auth", createAuthRouter(config));
api.use("/landlord", createLandlordRouter());

app.use(API_PREFIX, api);

  app.use(notFound);
  app.use(errorHandler(config));
  return app;
}

module.exports = { createApp, API_PREFIX };
