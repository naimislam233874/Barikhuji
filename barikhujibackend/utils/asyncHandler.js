"use strict";
// Express 4 does not catch rejected promises from async handlers. This forwards them to the error handler.
module.exports = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
