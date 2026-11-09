// The ONLY place that reads property data.
// Demo mode (BK_CONFIG.USE_SAMPLE_DATA = true) reads window.BK_SAMPLE. Backend mode calls the API and never falls back to demo data.
//
// Contract (camelCase JSON):
//   GET  /properties?location=&minRent=&maxRent=&type=&suitableFor=&bedrooms=&bathrooms=&furnished=&availableFrom=YYYY-MM-DD
//                   &amenities=a,b&featured=1&sort=rentAsc|rentDesc|newest&page=&limit=   -> { items, total, page, pages }
//   GET  /properties/:id                                                                  -> Property (404 when missing)
//   POST /inquiries { propertyId, name, phone, message }                                  -> 201 (body optional)
// Property: { id, title, area, city, rent, deposit, type, bedrooms, bathrooms, furnished, suitableFor[], amenities[],
//             availableFrom "YYYY-MM-DD", verified, featured, images[], description, landlord:{ name, verified, responseTime } }
window.BK_API = (() => {
  if (!window.BK_CONFIG) console.error("[Barikhuji] js/config.js must load before js/api.js.");
  const C = window.BK_CONFIG || { USE_SAMPLE_DATA: true, PAGE_SIZE: 6, API_BASE: "" };

  // Change this one line if the backend uses a different inquiry route, e.g. `/properties/${id}/inquiries`.
  const INQUIRY_PATH = "/inquiries";

  const MAX_LIMIT = 50;
  const PLACEHOLDER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#efe6d4"/>' +
    '<text x="50%" y="50%" text-anchor="middle" fill="#5d6b64" font-family="sans-serif" font-size="28">No photo</text></svg>');

  // ---------- helpers ----------
  const asArray = v => (Array.isArray(v) ? v : []);
  const dateOnly = v => (v ? String(v).slice(0, 10) : ""); // "2026-11-01T00:00:00Z" -> "2026-11-01"
  const imgUrl = u => (/^(https?:|data:)/.test(u) ? u : (C.ASSET_BASE || "") + u);
  const numOrNull = v => { if (v === undefined || v === null || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const text = v => (v === undefined || v === null ? "" : String(v).trim());
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  // Defensive mapping so one odd backend field (_id, null arrays, "28000.00") cannot crash the UI. Safe on already-clean data.
  function normalizeProperty(p) {
    if (!p || typeof p !== "object") return null;
    const l = p.landlord || {};
    const images = asArray(p.images).filter(Boolean).map(imgUrl);
    return {
      ...p,
      id: p.id ?? p._id,
      title: p.title || "Untitled property",
      area: p.area || "", city: p.city || "", type: p.type || "", furnished: p.furnished || "",
      description: p.description || "",
      rent: Number(p.rent) || 0, deposit: Number(p.deposit) || 0,
      bedrooms: Number(p.bedrooms) || 0, bathrooms: Number(p.bathrooms) || 0,
      suitableFor: asArray(p.suitableFor), amenities: asArray(p.amenities),
      images: images.length ? images : [PLACEHOLDER],
      availableFrom: dateOnly(p.availableFrom),
      verified: !!p.verified, featured: !!p.featured,
      landlord: { name: l.name || "Landlord", verified: !!l.verified, responseTime: l.responseTime || "Not available" }
    };
  }

  // ---------- backend transport ----------
  // Uses the shared client (js/http.js) when it is loaded, so CSRF, timeouts and the 401 redirect behave the same everywhere.
  // Otherwise falls back to a minimal built-in client, so api.js also works on its own.
  async function request(path, { method = "GET", body, query, signal } = {}) {
    if (window.BK_HTTP) return window.BK_HTTP.request(path, { method, body, query, signal });

    if (method !== "GET" && C.CSRF_PATH) throw new Error("CSRF is enabled in config.js, but js/http.js is not loaded.");
    const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.REQUEST_TIMEOUT_MS || 15000);
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", () => ctrl.abort(), { once: true }); }
    let res;
    try {
      res = await fetch(C.API_BASE + path + (qs ? "?" + qs : ""), {
        method, credentials: "include", signal: ctrl.signal,
        headers: body !== undefined ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      if (signal && signal.aborted) throw e; // caller cancelled on purpose; they check e.name === "AbortError"
      throw Object.assign(new Error(ctrl.signal.aborted ? "The server took too long to respond. Please try again." : "Cannot reach the server. Check your connection and try again."), { status: 0 });
    } finally { clearTimeout(timer); }

    const raw = await res.text(); // never call res.json() directly: 200/201/204 may have an empty body
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (_) { data = null; } }
    if (!res.ok) {
      const generic = res.status >= 500 ? "Something went wrong on our side. Please try again later." : "Request failed. Please check your input and try again.";
      throw Object.assign(new Error((data && data.message) || generic), { status: res.status, fields: (data && data.errors) || null });
    }
    return data;
  }

  // ---------- demo filtering (temporary; goes away with js/data/) ----------
  function demoQuery(q) {
    if (!Array.isArray(window.BK_SAMPLE)) throw new Error("Demo data is missing. Check that js/data/sample-properties.js loads before js/api.js.");
    let l = window.BK_SAMPLE.map(normalizeProperty).filter(Boolean);

    const loc = text(q.location).toLowerCase();
    if (loc) l = l.filter(p => (p.area + " " + p.city).toLowerCase().includes(loc));

    const min = numOrNull(q.minRent), max = numOrNull(q.maxRent);
    if (min !== null) l = l.filter(p => p.rent >= min);
    if (max !== null) l = l.filter(p => p.rent <= max);

    if (text(q.type)) l = l.filter(p => same(p.type, text(q.type)));
    if (text(q.suitableFor)) l = l.filter(p => p.suitableFor.some(s => same(s, text(q.suitableFor))));

    const beds = numOrNull(q.bedrooms), baths = numOrNull(q.bathrooms);
    if (beds !== null) l = l.filter(p => p.bedrooms >= beds);
    if (baths !== null) l = l.filter(p => p.bathrooms >= baths);

    if (text(q.furnished)) l = l.filter(p => same(p.furnished, text(q.furnished)));
    if (text(q.availableFrom)) l = l.filter(p => p.availableFrom && p.availableFrom <= text(q.availableFrom));

    const wanted = text(q.amenities).split(",").map(a => a.trim()).filter(Boolean);
    if (wanted.length) l = l.filter(p => wanted.every(a => p.amenities.some(x => same(x, a))));

    if (text(q.featured) && text(q.featured) !== "0" && text(q.featured) !== "false") l = l.filter(p => p.featured);

    // "newest" falls back to availableFrom only because sample data has no createdAt. The real API should sort by creation time.
    const sorts = { rentAsc: (a, b) => a.rent - b.rent, rentDesc: (a, b) => b.rent - a.rent, newest: (a, b) => b.availableFrom.localeCompare(a.availableFrom) };
    if (sorts[q.sort]) l.sort(sorts[q.sort]);

    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(numOrNull(q.limit) || C.PAGE_SIZE || 6)));
    const page = Math.max(1, Math.floor(numOrNull(q.page) || 1));
    return { items: l.slice((page - 1) * limit, page * limit), total: l.length, page, pages: Math.max(1, Math.ceil(l.length / limit)) };
  }

  // ---------- public API ----------
  // opts.signal (optional) lets a page cancel a stale request.
  async function getProperties(q = {}, opts = {}) {
    if (C.USE_SAMPLE_DATA) return demoQuery(q);
    const data = await request("/properties", { query: { limit: C.PAGE_SIZE, ...q }, signal: opts.signal });
    const items = asArray(data && data.items).map(normalizeProperty).filter(Boolean);
    return {
      items,
      total: Number(data && data.total) || items.length,
      page: Number(data && data.page) || 1,
      pages: Math.max(1, Number(data && data.pages) || 1)
    };
  }

  // Returns the property, or null ONLY when it does not exist. Any other failure throws, so the page shows a real error.
  async function getProperty(id, opts = {}) {
    if (id === null || id === undefined || id === "") return null;
    if (C.USE_SAMPLE_DATA) {
      if (!Array.isArray(window.BK_SAMPLE)) throw new Error("Demo data is missing. Check that js/data/sample-properties.js loads before js/api.js.");
      return normalizeProperty(window.BK_SAMPLE.find(p => String(p.id) === String(id)));
    }
    try {
      return normalizeProperty(await request(`/properties/${encodeURIComponent(id)}`, { signal: opts.signal }));
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function sendInquiry(data) {
    if (C.USE_SAMPLE_DATA) return { saved: false }; // nothing is stored in demo mode
    await request(INQUIRY_PATH, { method: "POST", body: data });
    return { saved: true };
  }

  return { getProperties, getProperty, sendInquiry, normalizeProperty };
})();