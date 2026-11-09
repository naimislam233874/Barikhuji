"use strict";
// Consistent JSON errors. Stack traces and internals never reach the client in production.
function notFound(req, res) {
  res.status(404).json({ message: "Not found." });
}

function errorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.too.large") return res.status(413).json({ message: "The request is too large." });
    if (err.type === "entity.parse.failed") return res.status(400).json({ message: "The request body is not valid JSON." });
    if (err.name === "ValidationError" && err.errors) {
      const errors = {};
      for (const [field, e] of Object.entries(err.errors)) errors[field] = e.message;
      return res.status(422).json({ message: Object.values(errors)[0], errors });
    }
    if (err.code === 11000) return res.status(409).json({ message: "That record already exists." });
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid identifier." });

    if (!config.isTest) console.error("[error]", req.method, req.path, "-", err.stack || err.message);
    const body = { message: "Something went wrong on our side. Please try again later." };
    if (!config.isProd && !config.isTest) body.detail = err.message; // development only
    res.status(500).json(body);
  };
}

module.exports = { notFound, errorHandler };
