// Barikhuji frontend configuration. No secrets belong in this file.
//
// MODE: "demo"    -> uses the temporary sample data (js/data/*). No backend needed.
//       "backend" -> calls the real API at API_BASE. Failures show errors; they never fall back to demo data.
(() => {
  const MODE = "backend";; // change to "backend" once the Phase 2 server is running

  const cfg = {
    MODE,
    // Existing code reads this flag, so it is kept and derived from MODE (don't edit it directly).
    USE_SAMPLE_DATA: MODE !== "backend",

    // No trailing slash. Must be https:// in production.
    API_BASE: "http://localhost:5000/api/v1",

    PAGE_SIZE: 6,

    // Optional settings. The API client has safe defaults if you remove them.
    REQUEST_TIMEOUT_MS: 15000,
    ASSET_BASE: "",            // prefix for relative image URLs returned by the API
    CSRF_PATH: "/auth/csrf",         // e.g. "/auth/csrf"; null disables the CSRF header
    CSRF_HEADER: "X-CSRF-Token"
  };

  if (MODE !== "demo" && MODE !== "backend") {
    console.warn('[Barikhuji] Unknown MODE "' + MODE + '". Use "demo" or "backend". Falling back to demo mode.');
  }

  cfg.API_BASE = String(cfg.API_BASE).replace(/\/+$/, "");
  if (!cfg.USE_SAMPLE_DATA && typeof location !== "undefined") {
    try {
      const apiUrl = new URL(cfg.API_BASE);
      const isLoopback = (h) => h === "localhost" || h === "127.0.0.1";
      if (isLoopback(location.hostname) && isLoopback(apiUrl.hostname) && apiUrl.hostname !== location.hostname) {
        apiUrl.hostname = location.hostname;
        cfg.API_BASE = apiUrl.toString().replace(/\/+$/, "");
      }
    } catch (_) {}
  }
  if (!cfg.USE_SAMPLE_DATA && !cfg.ASSET_BASE) {
    try { cfg.ASSET_BASE = new URL(cfg.API_BASE).origin; } catch (_) {}
  }
  cfg.SOCKET_BASE = cfg.ASSET_BASE || "";

  // Session cookies are not sent between different hosts such as 127.0.0.1 and localhost,
  // so warn early instead of leaving a silent login failure.
  if (!cfg.USE_SAMPLE_DATA) {
    try {
      const apiHost = new URL(cfg.API_BASE).hostname;
      if (location.hostname && apiHost !== location.hostname) {
        console.warn("[Barikhuji] This page is on '" + location.hostname + "' but API_BASE uses '" + apiHost +
          "'. Open the site on the same host (for example http://" + apiHost + ":5500) or logins will not persist.");
      }
    } catch (e) {
      console.error("[Barikhuji] API_BASE is not a valid URL:", cfg.API_BASE);
    }
  }

  window.BK_CONFIG = cfg;
})();