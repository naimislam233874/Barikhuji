"use strict";
// Bangladeshi mobile numbers. Input may be 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX. Stored as 01XXXXXXXXX.
const BD_INPUT = /^(?:\+?88)?(01[3-9]\d{8})$/;
const BD_NATIONAL = /^01[3-9]\d{8}$/;

function normalizePhone(value) {
  const s = String(value).trim().replace(/[\s-]/g, "");
  const m = BD_INPUT.exec(s);
  return m ? m[1] : s;
}

module.exports = { normalizePhone, BD_INPUT, BD_NATIONAL };
