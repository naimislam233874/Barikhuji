"use strict";
const bcrypt = require("bcryptjs");

// compareDummy() runs a real bcrypt comparison when the account does not exist, so response time does not reveal
// whether an email is registered.
function createPasswordService(rounds) {
  const dummyHash = bcrypt.hashSync("barikhuji-timing-equalizer", rounds);
  return {
    hash: plain => bcrypt.hash(plain, rounds),
    compare: (plain, hash) => bcrypt.compare(plain, hash),
    compareDummy: plain => bcrypt.compare(plain, dummyHash).then(() => false)
  };
}

module.exports = { createPasswordService };
