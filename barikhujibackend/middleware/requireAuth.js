"use strict";
const mongoose = require("mongoose");
const User = require("../models/User");

// Loads the signed-in user from the database on EVERY request, so a suspended account or a changed role
// takes effect immediately. The client's claim about who it is is never trusted.
async function requireAuth(req, res, next) {
  try {
    const id = req.session && req.session.userId;
    if (!id || !mongoose.isValidObjectId(id)) return res.status(401).json({ message: "Please sign in to continue." });
    const user = await User.findById(id);
    if (!user || user.status === "suspended") {
      return req.session.destroy(() => res.status(401).json({ message: "Your session has ended. Please sign in again." }));
    }
    req.user = user;
    next();
  } catch (err) { next(err); }
}

module.exports = requireAuth;
