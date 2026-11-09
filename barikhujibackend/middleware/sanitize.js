"use strict";
const { stripOperatorKeys } = require("../utils/sanitize");

module.exports = function sanitizeRequest(req, res, next) {
  stripOperatorKeys(req.body);
  stripOperatorKeys(req.query);
  stripOperatorKeys(req.params);
  next();
};
