"use strict";
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");

// Server-side sessions: the browser only holds an opaque, HttpOnly session id cookie. Session data lives in MongoDB.
// Call this AFTER mongoose has connected (the store reuses that connection). Tests may inject their own store.
function buildSession(config, { store } = {}) {
  const sessionStore = store || MongoStore.create({
    client: mongoose.connection.getClient(),
    collectionName: "sessions",
    ttl: Math.floor(config.session.maxAgeMs / 1000),
    touchAfter: 24 * 3600,
    autoRemove: "native"
  });
  return session({
    name: config.session.name,
    secret: config.session.secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false, // no cookie until we actually put something in the session
    proxy: config.trustProxy > 0 ? true : undefined,
    cookie: {
      httpOnly: true,
      secure: config.session.cookie.secure,
      sameSite: config.session.cookie.sameSite,
      maxAge: config.session.maxAgeMs,
      path: "/"
    }
  });
}

module.exports = { buildSession };
