"use strict";
const express = require("express");
const ctrl = require("../controllers/chatController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

function createChatRouter() {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(requireAuth, requireRole("customer", "landlord"));

  router.get("/conversations", ctrl.listConversations);
  router.post("/conversations", requireRole("customer"), ctrl.startOrGetConversation);
  router.get("/conversations/:id/messages", ctrl.getMessages);
  router.post("/conversations/:id/messages", ctrl.sendMessage);
  router.post("/conversations/:id/read", ctrl.markAsRead);

  return router;
}

module.exports = { createChatRouter };
