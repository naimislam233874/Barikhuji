"use strict";
const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { loadConfig } = require("./config/env");
const { connectDb, disconnectDb } = require("./config/db");

async function main() {
  let config;
  try { config = loadConfig(); }
  catch (e) { console.error(e.message); process.exit(1); }

  try { await connectDb(config.mongoUri); }
  catch (e) { console.error(e.message); process.exit(1); }

  const models = [
    require("./models/User"),
    require("./models/Property"),
    require("./models/Favorite"),
    require("./models/Inquiry"),
    require("./models/Booking"),
    require("./models/Conversation"),
    require("./models/Message"),
    require("./models/ModerationLog"),
    require("./models/ContactMessage")
  ];
  for (const M of models) await M.init();

  const { createApp } = require("./app");
  const { initSocket } = require("./socket");
  const app = createApp(config);
  const server = http.createServer(app);
  const io = initSocket(server, config, app.sessionMiddleware);
  app.set("io", io);

  server.listen(config.port, () => {
    console.log(`Barikhuji API listening on http://localhost:${config.port}/api/v1 (${config.nodeEnv})`);
    console.log(`Allowed frontend origins: ${config.frontendOrigins.join(", ")}`);
  });
  server.on("error", e => { console.error("Server error:", e.code === "EADDRINUSE" ? `port ${config.port} is already in use` : e.message); process.exit(1); });

  let closing = false;
  const shutdown = async signal => {
    if (closing) return; closing = true;
    console.log(`${signal} received, shutting down...`);
    setTimeout(() => process.exit(1), 10000).unref();
    io.close();
    server.close(async () => { await disconnectDb().catch(() => {}); process.exit(0); });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", e => { console.error("Unhandled rejection:", e && e.message); shutdown("unhandledRejection"); });
}

main().catch(e => { console.error("Startup failed:", e.message); process.exit(1); });
