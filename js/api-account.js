// Account, dashboard, admin and contact calls. The ONLY place these pages touch account data.
// Demo mode (BK_CONFIG.USE_SAMPLE_DATA = true) reads window.BK_SAMPLE_ACCOUNT (and window.BK_SAMPLE for favorites).
// Backend mode calls the API with session cookies and never falls back to demo data.
// Auth model: secure HttpOnly + SameSite session cookies (credentials:"include"). Nothing is stored in localStorage.
// Roles, ownership checks and CSRF must be enforced by the server; the client cannot.
//
// Endpoints used by this file (unchanged from the original):
//   POST /auth/{customer|landlord}/{login|register}   POST /auth/admin/login   POST /auth/logout
//   GET /me/favorites   DELETE /me/favorites/:id   GET /me/inquiries
//   GET /landlord/stats  GET /landlord/properties  GET /landlord/inquiries
//   POST /landlord/properties (multipart)  PUT /landlord/properties/:id (multipart)
//   PATCH /landlord/properties/:id/status {status}   DELETE /landlord/properties/:id
//   GET /admin/overview   POST /admin/properties/:id/review {decision}
//   POST /contact {name,email,phone?,subject,message}
// Wire codes the server should send/receive (the UI labels are mapped below):
//   listing status "active" | "paused" | "pending_review" | "rejected"
//   inquiry status "pending" | "replied" | "closed"
//   review decision "approved" | "rejected"
window.BK_ACCOUNT_API = (() => {
  if (!window.BK_CONFIG) console.error("[Barikhuji] js/config.js must load before js/api-account.js.");
  const C = window.BK_CONFIG || { USE_SAMPLE_DATA: true, API_BASE: "" };
  const demo = () => !!C.USE_SAMPLE_DATA;

  // Change this one function if the backend uses different auth routes (e.g. /auth/register, /auth/login).
  const authPath = (kind, mode) => `/auth/${kind}/${mode}`;

  // ---------- helpers ----------
  const asArray = v => (Array.isArray(v) ? v : []);
  const listOf = d => (Array.isArray(d) ? d : asArray(d && d.items));
  const num = v => Number(v) || 0;
  const dateOnly = v => (v ? String(v).slice(0, 10) : "");
  const humanize = v => { const s = String(v ?? "").replace(/_/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : "Unknown"; };
  const key = v => String(v ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_"); // "Pending review" -> "pending_review"
  const LISTING_STATUS = { active: "Active", paused: "Paused", pending_review: "Pending review", rejected: "Rejected" };
  const INQUIRY_STATUS = { pending: "Pending", replied: "Replied", closed: "Closed" };
  const listingLabel = v => LISTING_STATUS[key(v)] || humanize(v);
  const inquiryLabel = v => INQUIRY_STATUS[key(v)] || humanize(v);
  const normProp = p => (window.BK_API && window.BK_API.normalizeProperty ? window.BK_API.normalizeProperty(p) : p);

  function sample() {
    if (!window.BK_SAMPLE_ACCOUNT) throw new Error("Demo data is missing. Load js/data/sample-account.js before js/api-account.js.");
    return window.BK_SAMPLE_ACCOUNT;
  }

  // ---------- backend transport ----------
  // Uses the shared client (js/http.js) when loaded, so CSRF, timeouts and the 401 redirect match api.js.
  // Otherwise a minimal built-in client is used. opts: { method, body (object | FormData), query, signal, auth401 }
  async function req(path, opts = {}) {
    if (window.BK_HTTP) return window.BK_HTTP.request(path, opts);

    const { method = "GET", body, query, signal, auth401 = true } = opts;
    if (method !== "GET" && C.CSRF_PATH) throw new Error("CSRF is enabled in config.js, but js/http.js is not loaded.");
    const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    const headers = { Accept: "application/json" };
    let payload;
    if (body instanceof FormData) payload = body; // the browser sets the multipart boundary itself
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.REQUEST_TIMEOUT_MS || 15000);
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", () => ctrl.abort(), { once: true }); }
    let res;
    try {
      res = await fetch(C.API_BASE + path + (qs ? "?" + qs : ""), { method, headers, body: payload, credentials: "include", signal: ctrl.signal });
    } catch (e) {
      if (signal && signal.aborted) throw e;
      throw Object.assign(new Error(ctrl.signal.aborted ? "The server took too long to respond. Please try again." : "Cannot reach the server. Check your connection and try again."), { status: 0 });
    } finally { clearTimeout(timer); }

    const raw = await res.text(); // never res.json() directly: 200/204 can have an empty body
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (_) { data = null; } }
    if (!res.ok) {
      if (res.status === 401 && auth401) { const login = document.body && document.body.dataset.login; if (login) location.href = login; }
      const generic = res.status === 401 ? "Please sign in to continue." : res.status === 403 ? "You do not have permission to do that."
        : res.status >= 500 ? "Something went wrong on our side. Please try again later." : "Request failed. Please check your input and try again.";
      throw Object.assign(new Error((data && data.message) || generic), { status: res.status, fields: (data && data.errors) || null });
    }
    return data;
  }

  // ---------- Auth ----------
  const AUTH_KINDS = ["customer", "landlord", "admin"], AUTH_MODES = ["login", "register"];
  async function auth(kind, mode, data) {
    // The route comes from a data-auth attribute in the HTML, so allowlist it. Admin accounts are never self-registered.
    if (!AUTH_KINDS.includes(kind) || !AUTH_MODES.includes(mode) || (kind === "admin" && mode !== "login")) {
      throw new Error("Unsupported sign-in request.");
    }
    if (demo()) return { notConnected: true }; // nothing is sent and no session is created
    // auth401:false because 401 here means "wrong password", not "session expired"
    const res = await req(authPath(kind, mode), { method: "POST", body: data, auth401: false });
    if (window.BK_HTTP) window.BK_HTTP.resetCsrf();
    return { ok: true, user: (res && res.user) || null };
  }
  async function logout() {
    if (demo()) return { notConnected: true };
    await req("/auth/logout", { method: "POST", auth401: false });
    if (window.BK_HTTP) window.BK_HTTP.resetCsrf();
    return { ok: true };
  }

  // ---------- Customer ----------
  async function getFavorites() {
    if (demo()) {
      if (!Array.isArray(window.BK_SAMPLE)) throw new Error("Demo data is missing. Load js/data/sample-properties.js first.");
      return sample().favoriteIds.map(id => window.BK_SAMPLE.find(p => p.id === id)).filter(Boolean).map(normProp);
    }
    return listOf(await req("/me/favorites")).map(normProp).filter(Boolean); // array of property objects, or { items }
  }
  async function removeFavorite(id) {
    if (demo()) return { saved: false };
    await req(`/me/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { saved: true };
  }
  async function getInquiries() {
    const raw = demo() ? sample().inquiries : listOf(await req("/me/inquiries"));
    return asArray(raw).map(i => ({
      id: i.id ?? i._id, propertyId: i.propertyId, propertyTitle: i.propertyTitle || "Removed listing",
      message: i.message || "", sentAt: dateOnly(i.sentAt), status: inquiryLabel(i.status)
    }));
  }

  // ---------- Landlord ----------
  async function getLandlordOverview() { // -> { stats, listings, inquiries }
    let stats, listings, inquiries;
    if (demo()) ({ stats, listings, inquiries } = sample().landlord);
    else {
      const r = await Promise.all([req("/landlord/stats"), req("/landlord/properties"), req("/landlord/inquiries")]);
      stats = r[0]; listings = listOf(r[1]); inquiries = listOf(r[2]);
    }
    stats = stats || {};
    return {
      stats: { activeListings: num(stats.activeListings), pendingListings: num(stats.pendingListings), views: num(stats.views), inquiries: num(stats.inquiries) },
      listings: asArray(listings).map(l => ({ id: l.id ?? l._id, title: l.title || "Untitled", area: l.area || "", rent: num(l.rent), status: listingLabel(l.status), views: num(l.views), inquiries: num(l.inquiries) })),
      inquiries: asArray(inquiries).map(i => ({ id: i.id ?? i._id, propertyTitle: i.propertyTitle || "", fromName: i.fromName || "Customer", message: i.message || "", sentAt: dateOnly(i.sentAt) }))
    };
  }
  // formData is multipart: "suitableFor" and "amenities" repeat as keys, photo files go under "images".
  // Some frameworks (PHP/Laravel) do not parse multipart on PUT. If yours does not, change the edit call to POST with a method override.
  async function saveListing(formData, id) {
    if (!(formData instanceof FormData)) throw new Error("saveListing expects FormData.");
    if (demo()) return { saved: false };
    await req(id ? `/landlord/properties/${encodeURIComponent(id)}` : "/landlord/properties", { method: id ? "PUT" : "POST", body: formData });
    return { saved: true };
  }
  async function setListingStatus(id, label) { // label from the UI: "Active" | "Paused"
    const wire = key(label);
    if (!["active", "paused"].includes(wire)) throw new Error("Only Active and Paused can be set here.");
    if (demo()) return { saved: false };
    await req(`/landlord/properties/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status: wire } });
    return { saved: true };
  }
  async function deleteListing(id) {
    if (demo()) return { saved: false };
    await req(`/landlord/properties/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { saved: true };
  }

  // ---------- Admin ----------
  async function getAdminOverview() { // -> { stats, pending, users }
    const o = (demo() ? sample().admin : await req("/admin/overview")) || {};
    const s = o.stats || {};
    return {
      stats: { users: num(s.users), landlords: num(s.landlords), activeListings: num(s.activeListings), pendingReviews: num(s.pendingReviews), openReports: num(s.openReports) },
      pending: asArray(o.pending).map(p => ({ id: p.id ?? p._id, title: p.title || "Untitled", landlordName: p.landlordName || "", submittedAt: dateOnly(p.submittedAt) })),
      users: asArray(o.users).map(u => ({ id: u.id ?? u._id, name: u.name || "", email: u.email || "", role: humanize(u.role), status: humanize(u.status) }))
    };
  }
  async function reviewListing(id, decision) { // decision: "approved" | "rejected"
    if (!["approved", "rejected"].includes(decision)) throw new Error("Invalid decision.");
    if (demo()) return { saved: false };
    await req(`/admin/properties/${encodeURIComponent(id)}/review`, { method: "POST", body: { decision } });
    return { saved: true };
  }

  // ---------- Contact ----------
  async function sendContact(data) {
    if (demo()) return { saved: false };
    await req("/contact", { method: "POST", body: data });
    return { saved: true };
  }

  return { auth, logout, getFavorites, removeFavorite, getInquiries, getLandlordOverview, saveListing, setListingStatus, deleteListing, getAdminOverview, reviewListing, sendContact };
})();