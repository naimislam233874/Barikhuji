"use strict";
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const User = require("../models/User");
const Conversation = require("../models/Conversation");

const OBJECT_ID = /^[0-9a-f]{24}$/i;

function initSocket(httpServer, config, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.frontendOrigins,
      credentials: true,
      methods: ["GET", "POST"]
    }
  });

  // Share the Express session middleware with Socket.IO handshake requests.
  io.engine.use(sessionMiddleware);

  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers && socket.handshake.headers.origin;
      if (origin && !config.frontendOrigins.includes(origin)) {
        return next(new Error("Origin not allowed"));
      }
      const userId = socket.request.session && socket.request.session.userId;
      if (!userId || !mongoose.isValidObjectId(userId)) {
        return next(new Error("Authentication required"));
      }
      const user = await User.findById(userId).select("_id role status name");
      if (!user || user.status === "suspended" || !["customer", "landlord"].includes(user.role)) {
        return next(new Error("Unauthorized"));
      }
      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", socket => {
    const uid = String(socket.user._id);
    socket.join(`user:${uid}`);

    socket.on("chat:join", async (conversationId, ack) => {
      try {
        const cid = String(conversationId || "");
        if (!OBJECT_ID.test(cid)) {
          if (typeof ack === "function") ack({ ok: false, message: "Invalid conversation." });
          return;
        }
        const conv = await Conversation.findById(cid).select("customer landlord").lean();
        if (!conv || (String(conv.customer) !== uid && String(conv.landlord) !== uid)) {
          if (typeof ack === "function") ack({ ok: false, message: "Access denied." });
          return;
        }
        socket.join(`conv:${cid}`);
        if (typeof ack === "function") ack({ ok: true });
      } catch (_) {
        if (typeof ack === "function") ack({ ok: false, message: "Failed to join conversation." });
      }
    });

    socket.on("chat:leave", conversationId => {
      const cid = String(conversationId || "");
      if (OBJECT_ID.test(cid)) socket.leave(`conv:${cid}`);
    });
  });

  return io;
}

module.exports = { initSocket };
