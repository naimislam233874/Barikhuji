"use strict";
const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

const STATES = ["disconnected", "connected", "connecting", "disconnecting"];
const dbState = () => STATES[mongoose.connection.readyState] || "unknown";

async function connectDb(uri) {
  mongoose.connection.on("error", e => console.error("[db] connection error:", e.message));
  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    // e.message describes the failure (host unreachable, auth failed...). The connection string itself is never printed.
    throw new Error(`Could not connect to MongoDB: ${e.name}: ${e.message}`);
  }
  return mongoose.connection;
}

async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb, dbState };
