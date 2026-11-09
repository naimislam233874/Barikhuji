"use strict";
// NoSQL-injection defence, layer 1: delete any key that starts with "$", contains ".", or is "__proto__".
// Layer 2 is the validators, which require string fields to BE strings, so {"$gt": ""} can never reach a query.
// Mutates in place (works whether req.query is a plain property or a getter).
function stripOperatorKeys(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 10) return 0;
  let removed = 0;
  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".") || key === "__proto__") { delete value[key]; removed++; continue; }
    removed += stripOperatorKeys(value[key], depth + 1);
  }
  return removed;
}
module.exports = { stripOperatorKeys };
