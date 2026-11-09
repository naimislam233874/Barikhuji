"use strict";
const ROLES = ["customer", "landlord", "admin"];

// Usage: router.get("/x", requireAuth, requireRole("admin"), handler). Must come AFTER requireAuth.
function requireRole(...roles) {
  if (!roles.length || roles.some(r => !ROLES.includes(r))) throw new Error("requireRole: pass one or more of " + ROLES.join(", "));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Please sign in to continue." });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission to do that." });
    next();
  };
}

module.exports = requireRole;
