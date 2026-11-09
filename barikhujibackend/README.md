# Barikhuji backend, Step 1: foundation and authentication

Node.js + Express 4 + MongoDB (Mongoose) with server-side sessions. Only authentication is implemented in this step.
Properties, favorites, inquiries, landlord tools and admin moderation come in later steps. The frontend's demo mode keeps working.

## Prerequisites
- Node.js 22 or newer
- MongoDB: local (`mongodb://127.0.0.1:27017/barikhuji`) or a MongoDB Atlas connection string

## Setup
```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
# put a random 32+ character SESSION_SECRET in .env:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run dev                 # or: npm start
```
Check it: open http://localhost:5000/api/v1/health. It should say `"database": "connected"`.

## Environment variables (see `.env.example`)
| Variable | Purpose |
|---|---|
| `PORT` | default 5000 |
| `MONGODB_URI` | required |
| `SESSION_SECRET` | required, 32+ random characters; the server refuses to start without it |
| `NODE_ENV` | `development`, `test` or `production` |
| `FRONTEND_ORIGIN` | comma-separated exact origins allowed by CORS and checked by CSRF protection |
| `SESSION_NAME`, `SESSION_MAX_AGE_DAYS` | cookie name (default `bk.sid`) and lifetime (default 7 days) |
| `COOKIE_SECURE`, `COOKIE_SAMESITE` | defaults: secure only in production, `lax` |
| `TRUST_PROXY` | number of reverse proxies in front of the app (0 locally, usually 1 on a host) |
| `BCRYPT_ROUNDS` | default 12 (minimum 10 outside tests) |
| `RATE_LIMIT_*` | login and registration limits |

## Endpoints (base `http://localhost:5000/api/v1`)
These paths are exactly what `js/api-account.js` already calls.

| Method and path | Access | Notes |
|---|---|---|
| `GET /health` | public | real database state; 503 when MongoDB is down |
| `GET /auth/csrf` | public | returns `{ "csrfToken": "..." }` |
| `POST /auth/customer/register` | public, CSRF, rate limited | body: `fullName, email, phone, password`; returns 201 `{ user }`; does **not** sign in |
| `POST /auth/landlord/register` | same | creates a landlord with status `pending_verification` |
| `POST /auth/customer/login` | public, CSRF, rate limited | body: `email, password`; returns `{ user, csrfToken }` |
| `POST /auth/landlord/login` | same | landlords only |
| `POST /auth/admin/login` | same | admins only |
| `POST /auth/logout` | CSRF | 204; destroys the session |
| `GET /auth/me` | signed in | `{ user }`; re-checks the database on every call |

There is no admin registration endpoint. Errors are JSON: `{ "message": "...", "errors": { "field": "..." } }`.
Login fails with the same `401 Invalid email or password.` for an unknown email, a wrong password and the wrong portal.

## Sessions, cookies, CORS
- The browser holds only an HttpOnly session-id cookie. Session data is stored in MongoDB (`sessions` collection). No tokens go in localStorage.
- A new session id is issued at login (session-fixation defence) and the session is destroyed at logout.
- CORS allows only the origins in `FRONTEND_ORIGIN`, with credentials. The frontend already sends `credentials: "include"`.
- **Open the site on the same host name as the API.** Use `http://localhost:5500` with `http://localhost:5000`. `127.0.0.1` and `localhost` are different sites, so the cookie would not be sent.

## CSRF: what the frontend does
1. `GET /auth/csrf` returns a token stored in the session.
2. Every POST/PUT/PATCH/DELETE sends it in the `X-CSRF-Token` header. `js/http.js` already does this when `CSRF_PATH` is set.
3. Login and logout replace the session, so the client fetches a new token afterwards (`BK_HTTP.resetCsrf()` is already called by `api-account.js`).

To connect the existing frontend, edit `js/config.js` (this step did not change it):
```js
const MODE = "backend";
// ...and inside cfg:
CSRF_PATH: "/auth/csrf",
```
`js/http.js` must be loaded on every page that calls the API.

## Creating the first administrator
```bash
npm run create-admin
```
It prompts for the email and a hidden password (12+ characters), or reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` for one run.
- Never prints the password. Remove `ADMIN_PASSWORD` from `.env` afterwards.
- Refuses to modify an existing account and refuses to add a second admin unless you pass `--allow-additional`.
- Rotate a password on purpose: `npm run create-admin -- --rotate-password`. This also ends that admin's active sessions.
- After setup, the script does nothing harmful if run again: it exits without changes.

## Tests
```bash
npm test
```
- **Unit tests** need no database: config rules, password policy, CSRF, role guard, error handler, input sanitising.
- **Tests that need installed packages** (bcrypt hashing, User model rules) skip themselves until `npm install` has run.
- **Integration tests** (registration, login, sessions, CSRF, rate limiting, CORS...) need MongoDB:
```bash
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/barikhuji_test npm test      # Windows PowerShell: $env:TEST_MONGODB_URI="..."; npm test
```
The database name **must contain "test"**: those tests delete all users and sessions in it. Never point it at real data.

## Known limitations of Step 1
- No password reset, email verification or profile update yet.
- Rate-limit counters live in memory (fine for one server process; use a shared store for several).
- Static `Cross-Origin-Resource-Policy` from Helmet is `same-origin`; revisit when uploaded images are served in a later step.
- Landlord accounts can sign in while `pending_verification`; listing review comes in a later step.
