"use strict";
// Creates the FIRST administrator. Run once from the backend folder:  npm run create-admin
//   - Credentials come from ADMIN_EMAIL / ADMIN_PASSWORD (environment or .env), or you are prompted (password hidden).
//   - The password is hashed with bcrypt and is never printed or logged.
//   - Refuses to touch an existing account, and refuses to add a second admin unless you pass --allow-additional.
//   - To change an existing admin's password on purpose:  npm run create-admin -- --rotate-password
//     (this also ends every active session for that account).
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const readline = require("readline");

const { loadConfig } = require("../config/env");
const { connectDb, disconnectDb } = require("../config/db");
const { checkPassword } = require("../utils/passwordPolicy");
const { createPasswordService } = require("../utils/password");

const args = new Set(process.argv.slice(2));
const ROTATE = args.has("--rotate-password");
const ALLOW_ADDITIONAL = args.has("--allow-additional");
const MIN_ADMIN_PASSWORD = 12;

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

function askHidden(label) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("No terminal available for a hidden prompt. Set ADMIN_PASSWORD for this one run instead."));
    process.stdout.write(label);
    let buffer = "";
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const done = () => { stdin.removeListener("data", onData); stdin.setRawMode(false); stdin.pause(); process.stdout.write("\n"); };
    const onData = chunk => {
      for (const c of chunk) {
        if (c === "\u0003") { done(); process.exit(130); }
        if (c === "\r" || c === "\n") { done(); return resolve(buffer); }
        if (c === "\u007f" || c === "\b") buffer = buffer.slice(0, -1);
        else if (c >= " ") buffer += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  let config;
  try { config = loadConfig(process.env, { requireSession: false }); }
  catch (e) { console.error(e.message); return 1; }

  let email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    if (!process.stdin.isTTY) { console.error("Set ADMIN_EMAIL, or run this in an interactive terminal."); return 1; }
    email = (await ask("Admin email: ")).toLowerCase();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { console.error("That is not a valid email address."); return 1; }

  let password = process.env.ADMIN_PASSWORD || "";
  if (!password) {
    password = await askHidden("Admin password (hidden): ");
    if (password !== await askHidden("Repeat password: ")) { console.error("The passwords do not match."); return 1; }
  }
  const policy = checkPassword(password, { email, minLength: MIN_ADMIN_PASSWORD });
  if (!policy.ok) { console.error(policy.message + ` (admin passwords need at least ${MIN_ADMIN_PASSWORD} characters)`); return 1; }

  await connectDb(config.mongoUri);
  const User = require("../models/User");
  await User.init();
  const passwords = createPasswordService(config.bcryptRounds);
  const existing = await User.findOne({ email }).select("+passwordHash");

  if (ROTATE) {
    if (!existing || existing.role !== "admin") { console.error("No admin account with that email exists, so there is nothing to rotate."); return 1; }
    existing.passwordHash = await passwords.hash(password);
    await existing.save();
    // Session documents store JSON text; the id is a 24-char hex ObjectId, so this pattern is safe.
    const r = await require("mongoose").connection.collection("sessions").deleteMany({ session: { $regex: `"userId":"${existing._id}"` } });
    console.log(`Password rotated for ${email}. Ended ${r.deletedCount} active session(s).`);
    return 0;
  }

  if (existing) { console.error("An account with that email already exists. Nothing was changed. (Use --rotate-password to change an admin's password.)"); return 1; }
  if (!ALLOW_ADDITIONAL && await User.exists({ role: "admin" })) {
    console.error("An administrator already exists. Nothing was changed. Pass --allow-additional if you really want another one.");
    return 1;
  }

  await User.create({ name: String(process.env.ADMIN_NAME || "Site Administrator").trim().slice(0, 80), email, passwordHash: await passwords.hash(password), role: "admin", status: "active" });
  console.log(`Administrator created: ${email}`);
  console.log("Next: remove ADMIN_PASSWORD from your environment/.env and sign in at the admin login page.");
  return 0;
}

main()
  .then(async code => { await disconnectDb().catch(() => {}); process.exit(code); })
  .catch(async e => { console.error("Failed:", e.message); await disconnectDb().catch(() => {}); process.exit(1); });
