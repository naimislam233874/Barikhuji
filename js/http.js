// Shared HTTP client for api.js and api-account.js. Only used when USE_SAMPLE_DATA is false.
// Handles: credentials, timeout, cancel, CSRF, empty bodies, readable errors, 401 redirect.
window.BK_HTTP = (() => {
  const C = window.BK_CONFIG;
  if (location.protocol === "https:" && /^http:\/\//.test(C.API_BASE)) {
    console.warn("[Barikhuji] API_BASE is http:// but this page is https://. Browsers block mixed content.");
  }

  class ApiError extends Error {
    constructor(message, status = 0, fields = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.fields = fields; // optional { fieldName: "message" } from the server's validation errors
    }
  }

  function messageFor(status) {
    if (status === 401) return "Please sign in to continue.";
    if (status === 403) return "You do not have permission to do that.";
    if (status === 404) return "We could not find what you asked for.";
    if (status === 413) return "The upload is too large.";
    if (status === 429) return "Too many requests. Please wait a moment and try again.";
    if (status >= 500) return "Something went wrong on our side. Please try again later.";
    return "Request failed. Please check your input and try again.";
  }

  const clean = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));

  // Optional CSRF: set CSRF_PATH in config.js (the backend uses "/auth/csrf"). The endpoint must return { "csrfToken": "..." }.
  let csrfPromise = null;
  function getCsrf() {
    if (!csrfPromise) {
      csrfPromise = request(C.CSRF_PATH, { auth401: false }).then(d => {
        if (!d || !d.csrfToken) throw new ApiError("Could not start a secure session. Please reload the page.");
        return d.csrfToken;
      });
      csrfPromise.catch(() => { csrfPromise = null; });
    }
    return csrfPromise;
  }
  function resetCsrf() { csrfPromise = null; } // call after login/logout; the session (and its token) is replaced

  function handleUnauthorized() {
    // Only dashboards set data-login. Login pages don't, so there is no redirect loop.
    const login = document.body && document.body.dataset.login;
    if (login) location.href = login;
  }

  // opts: { method, body (object | FormData), query, signal, auth401 }
  async function request(path, opts = {}) {
    const { method = "GET", body, query, signal, auth401 = true } = opts;
    const qs = query ? new URLSearchParams(clean(query)).toString() : "";
    const url = C.API_BASE + path + (qs ? "?" + qs : "");

    const headers = { Accept: "application/json" };
    let payload;
    if (body instanceof FormData) payload = body; // the browser sets the multipart boundary itself
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    if (method !== "GET" && C.CSRF_PATH) headers[C.CSRF_HEADER || "X-CSRF-Token"] = await getCsrf();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.REQUEST_TIMEOUT_MS || 15000);
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", () => ctrl.abort(), { once: true }); }

    let res;
    try {
      res = await fetch(url, { method, headers, body: payload, credentials: "include", signal: ctrl.signal });
    } catch (e) {
      if (signal && signal.aborted) throw e; // the caller cancelled on purpose; callers check e.name === "AbortError"
      throw new ApiError(ctrl.signal.aborted
        ? "The server took too long to respond. Please try again."
        : "Cannot reach the server. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text(); // never call res.json() directly: 200/204 can have an empty body
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }

    if (!res.ok) {
      if (res.status === 401 && auth401) handleUnauthorized();
      throw new ApiError((data && data.message) || messageFor(res.status), res.status, data && data.errors ? data.errors : null);
    }
    return data;
  }

  return { request, ApiError, resetCsrf };
})();