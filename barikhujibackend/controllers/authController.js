"use strict";
const crypto = require("crypto");
const User = require("../models/User");
const { createPasswordService } = require("../utils/password");
const { normalizePhone } = require("../utils/phone");
const asyncHandler = require("../utils/asyncHandler");

const GENERIC_LOGIN_ERROR = "Invalid email or password."; // identical for unknown email, wrong password and wrong portal

function createAuthController(config) {
  const passwords = createPasswordService(config.bcryptRounds);
  const cb = (fn) => (req) => new Promise((resolve, reject) => fn.call(req.session, err => (err ? reject(err) : resolve())));
  const regenerate = cb(function (done) { return this.regenerate(done); });
  const save = cb(function (done) { return this.save(done); });

  // role is fixed by the route that mounts this handler. req.body.role is never read.
  const register = role => asyncHandler(async (req, res) => {
    const { fullName, email, phone, password } = req.body;
    const passwordHash = await passwords.hash(password);
    let user;
    try {
      user = await User.create({
        name: fullName, email, phone: normalizePhone(phone), passwordHash, role,
        status: role === "landlord" ? "pending_verification" : "active"
      });
    } catch (err) {
      if (err && err.code === 11000) return res.status(409).json({ message: "An account with this email or mobile number already exists." });
      throw err;
    }
    // The frontend sends people to the login page after registering, so no session is created here.
    res.status(201).json({ user: user.toJSON(), message: "Account created. Please sign in." });
  });

  const login = expectedRole => asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+passwordHash");
    // Always run one bcrypt comparison so timing does not reveal whether the email exists.
    const passwordOk = user ? await passwords.compare(password, user.passwordHash) : await passwords.compareDummy(password);
    if (!user || !passwordOk || user.role !== expectedRole) return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
    if (user.status === "suspended") return res.status(403).json({ message: "This account has been suspended. Please contact support." });

    await regenerate(req); // new session id after login defeats session fixation
    req.session.userId = String(user._id);
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    await save(req);
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});
    res.json({ user: user.toJSON(), csrfToken: req.session.csrfToken });
  });

  const logout = (req, res, next) => {
    if (!req.session) return res.status(204).end();
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie(config.session.name, { path: "/", httpOnly: true, secure: config.session.cookie.secure, sameSite: config.session.cookie.sameSite });
      res.status(204).end();
    });
  };

  const me = (req, res) => res.json({ user: req.user.toJSON() });

  return { register, login, logout, me };
}

module.exports = { createAuthController, GENERIC_LOGIN_ERROR };
