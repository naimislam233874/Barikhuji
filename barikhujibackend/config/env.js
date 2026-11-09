"use strict";
// Reads and validates environment variables. Collects EVERY problem, then throws once.
// Secret values are never included in error messages.

class ConfigError extends Error {
  constructor(message) { super(message); this.name = "ConfigError"; }
}

const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(secret|password)|placeholder|example/i;
const DEV_ORIGINS = ["http://localhost:5500", "http://127.0.0.1:5500"];
const SAMESITE = ["lax", "strict", "none"];

function parseOrigins(raw, errors, isProd) {
  const out = [];
  for (const item of String(raw || "").split(",").map(s => s.trim()).filter(Boolean)) {
    let u;
    try { u = new URL(item); } catch (_) { errors.push(`FRONTEND_ORIGIN has an invalid entry: "${item}".`); continue; }
    if (!/^https?:$/.test(u.protocol) || u.origin !== item.replace(/\/+$/, "")) {
      errors.push(`FRONTEND_ORIGIN entries must be bare origins such as https://example.com (got "${item}").`);
      continue;
    }
    if (isProd && u.protocol !== "https:") errors.push(`FRONTEND_ORIGIN must use https in production (got "${item}").`);
    out.push(u.origin);
  }
  return out;
}

function loadConfig(env = process.env, opts = {}) {
  const { requireSession = true, requireDb = true } = opts;
  const errors = [];

  const nodeEnv = env.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(nodeEnv)) errors.push('NODE_ENV must be "development", "test" or "production".');
  const isProd = nodeEnv === "production", isTest = nodeEnv === "test";

  const int = (name, def, min = 1) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) { errors.push(`${name} must be an integer >= ${min}.`); return def; }
    return n;
  };

  const port = int("PORT", 5000, 1);
  if (port > 65535) errors.push("PORT must be between 1 and 65535.");

  const mongoUri = String(env.MONGODB_URI || "").trim();
  if (requireDb) {
    if (!mongoUri) errors.push("MONGODB_URI is required (see .env.example).");
    else if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) errors.push("MONGODB_URI must start with mongodb:// or mongodb+srv://.");
  }

  let secret = env.SESSION_SECRET || "";
  if (requireSession) {
    if (!secret && isTest) secret = "test-only-secret-never-use-outside-automated-tests-0123456789";
    else if (secret.length < 32) errors.push('SESSION_SECRET is required and must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    else if (PLACEHOLDER.test(secret)) errors.push("SESSION_SECRET still looks like a placeholder. Generate a random value.");
  }

  let frontendOrigins = parseOrigins(env.FRONTEND_ORIGIN, errors, isProd);
  if (!frontendOrigins.length) {
    if (isProd) errors.push("FRONTEND_ORIGIN is required in production.");
    else frontendOrigins = DEV_ORIGINS;
  }

  const sameSite = String(env.COOKIE_SAMESITE || "lax").toLowerCase();
  if (!SAMESITE.includes(sameSite)) errors.push("COOKIE_SAMESITE must be lax, strict or none.");
  const secure = env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === ""
    ? isProd : ["1", "true", "yes"].includes(String(env.COOKIE_SECURE).toLowerCase());
  if (sameSite === "none" && !secure) errors.push("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (HTTPS).");
  if (isProd && !secure) errors.push("COOKIE_SECURE must be true in production.");

  const sessionName = String(env.SESSION_NAME || "bk.sid");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sessionName)) errors.push("SESSION_NAME may only contain letters, digits, dot, underscore and hyphen.");

  const csrfHeader = String(env.CSRF_HEADER || "X-CSRF-Token");
  if (!/^[A-Za-z0-9-]{1,64}$/.test(csrfHeader)) errors.push("CSRF_HEADER may only contain letters, digits and hyphens.");

  const bcryptRounds = int("BCRYPT_ROUNDS", isTest ? 4 : 12, 4);
  if (bcryptRounds > 15) errors.push("BCRYPT_ROUNDS must be 15 or lower.");
  if (!isTest && bcryptRounds < 10) errors.push("BCRYPT_ROUNDS must be at least 10 outside automated tests.");

  const cfg = {
    nodeEnv, isProd, isTest, port, mongoUri, frontendOrigins, csrfHeader, bcryptRounds,
    trustProxy: int("TRUST_PROXY", 0, 0),
    session: {
      secret, name: sessionName,
      maxAgeMs: int("SESSION_MAX_AGE_DAYS", 7, 1) * 24 * 60 * 60 * 1000,
      cookie: { secure, sameSite }
    },
    rateLimit: {
      windowMs: int("RATE_LIMIT_WINDOW_MINUTES", 15, 1) * 60 * 1000,
      loginIpMax: int("RATE_LIMIT_LOGIN_IP_MAX", 20, 1),
      loginEmailMax: int("RATE_LIMIT_LOGIN_EMAIL_MAX", 10, 1),
      registerMax: int("RATE_LIMIT_REGISTER_MAX", 10, 1)
    }
  };

  if (errors.length) throw new ConfigError("Invalid configuration:\n - " + errors.join("\n - "));
  return Object.freeze(cfg);
}

module.exports = { loadConfig, ConfigError };
