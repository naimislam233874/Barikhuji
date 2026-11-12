
window.BK = (() => {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  const taka = (n) => "৳" + Number(n || 0).toLocaleString("en-BD");

  const badge = (text, cls = "") =>
    `<span class="badge ${esc(cls)}">${esc(text)}</span>`;

  const getRoot = () =>
    document.body?.dataset?.root ??
    (document.querySelector('link[href^="/css/"]') ? "/" : "");

  const navItemsFor = (user) => {
    const role = user && user.role;
    if (role === "customer") {
      return [
        { url: "browse.html", label: "Browse Rentals" },
        { url: "dashboard.html", label: "Renter Dashboard" },
        { url: "dashboard.html#bookings", label: "My Bookings" },
        { url: "dashboard.html#overview", label: "My Profile" },
        { type: "logout", label: "Logout" }
      ];
    }
    if (role === "landlord") {
      return [
        { url: "browse.html", label: "Browse Rentals" },
        { url: "landlord/dashboard.html", label: "Landlord Dashboard" },
        { url: "landlord/dashboard.html#listings", label: "My Properties" },
        { url: "landlord/property-form.html", label: "List Your Property", cls: "btn light" },
        { type: "logout", label: "Logout" }
      ];
    }
    if (role === "admin") {
      return [
        { url: "browse.html", label: "Browse Rentals" },
        { url: "about.html", label: "About" },
        { url: "contact.html", label: "Contact" },
        { url: "admin/dashboard.html", label: "Admin Dashboard", cls: "btn light" },
        { type: "logout", label: "Logout" }
      ];
    }
    return [
      { url: "browse.html", label: "Browse Rentals" },
      { url: "about.html", label: "About" },
      { url: "contact.html", label: "Contact" },
      { url: "login.html", label: "Login / Register", cls: "btn light" }
    ];
  };

  function resolveHref(root, url) {
    if (!url || /^(#|https?:|mailto:|tel:|\/)/.test(url)) return url;
    return root + url;
  }

  function renderNavItems(user) {
    const root = getRoot();
    return navItemsFor(user).map((item) => {
      if (item.type === "logout") {
        return `<button type="button" class="bk-nav-logout" data-nav-logout>${esc(item.label)}</button>`;
      }
      const clsAttr = item.cls ? ` class="${esc(item.cls)}"` : "";
      return `<a${clsAttr} href="${esc(resolveHref(root, item.url))}">${esc(item.label)}</a>`;
    }).join("");
  }

  function header(user = null) {
    return `
      <a class="skip" href="#main">Skip to content</a>
      <header class="site-header">
        <div class="container nav">
          <a class="brand" href="index.html" aria-label="Barikhuji home">
            Bari<span>khuji</span>
          </a>
          <button class="nav-toggle" aria-expanded="false" aria-controls="menu" type="button">
            Menu
          </button>
          <nav id="menu" class="menu" aria-label="Main navigation">
            ${renderNavItems(user)}
          </nav>
        </div>
      </header>`;
  }

  function footer() {
    return `
      <footer class="site-footer">
        <div class="container fgrid">
          <div>
            <h3 style="color:#fff">Barikhuji</h3>
            <p>Find verified rentals across Bangladesh.</p>
          </div>
          <div>
            <strong>Explore</strong><br>
            <a href="browse.html">Browse Rentals</a><br>
            <a href="safety.html">Safety Guidelines</a>
          </div>
          <div>
            <strong>Company</strong><br>
            <a href="about.html">About</a><br>
            <a href="contact.html">Contact</a>
          </div>
          <div>
            <strong>Legal</strong><br>
            <a href="privacy.html">Privacy Policy</a><br>
            <a href="terms.html">Terms</a>
          </div>
        </div>
        <p class="container" style="margin-top:1.5rem;font-size:.85rem">
          © ${new Date().getFullYear()} Barikhuji.com. All rights reserved.
        </p>
      </footer>`;
  }

  function propertyCard(p) {
    const images = Array.isArray(p.images) ? p.images : [];
    const suitableFor = Array.isArray(p.suitableFor) ? p.suitableFor : [];

    return `
      <article class="card">
        <a href="property.html?id=${encodeURIComponent(p.id)}">
          <img
            src="${esc(images[0] || "")}"
            alt="${esc(p.title || "Rental property")}"
            loading="lazy"
            onerror="this.style.visibility='hidden'"
          >
        </a>
        <div class="body">
          <div class="chips">
            ${p.verified ? badge("✓ Verified", "ok") : ""}
            ${suitableFor.map(s => badge(s)).join("")}
          </div>
          <h3>
            <a href="property.html?id=${encodeURIComponent(p.id)}"
               style="text-decoration:none;color:inherit">
              ${esc(p.title || "Rental property")}
            </a>
          </h3>
          <p style="margin:0;color:var(--mu)">
            ${esc(p.area || "")}, ${esc(p.city || "")}
            · ${Number(p.bedrooms || 0)} bed
            · ${Number(p.bathrooms || 0)} bath
          </p>
          <p class="price">
            ${taka(p.rent)}
            <small style="font-weight:400;color:var(--mu)"> /month</small>
          </p>
        </div>
      </article>`;
  }

  function openModal(title, html) {
    closeModal();

    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.id = "modal-bg";
    bg.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
        <h2 id="mt">${esc(title)}</h2>
        ${html}
        <button class="btn outline" data-close type="button">Close</button>
      </div>`;

    bg.addEventListener("click", (e) => {
      if (e.target === bg || e.target.closest("[data-close]")) {
        closeModal();
      }
    });

    document.body.append(bg);
    (bg.querySelector("input, textarea, button") || bg).focus();
    return bg;
  }

  function closeModal() {
    document.getElementById("modal-bg")?.remove();
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  function field({ id, label, type = "text", required = false, attrs = "" }) {
    return `
      <div class="field">
        <label for="${esc(id)}">
          ${esc(label)}${required ? " *" : ""}
        </label>
        <input id="${esc(id)}" name="${esc(id)}" type="${esc(type)}"
          ${required ? "required" : ""} ${attrs}>
        <span class="err" id="${esc(id)}-err" aria-live="polite"></span>
      </div>`;
  }

  let authPromise = null;

  async function fetchCurrentUser() {
    const C = window.BK_CONFIG || {};
    if (C.USE_SAMPLE_DATA) return null;
    if (window.BK_ACCOUNT_API && typeof window.BK_ACCOUNT_API.getMe === "function") {
      try { return await window.BK_ACCOUNT_API.getMe(); } catch (_) { return null; }
    }
    if (!C.API_BASE) return null;
    try {
      const res = await fetch(C.API_BASE + "/auth/me", {
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data && data.user) || null;
    } catch (_) {
      return null;
    }
  }

  function getCurrentUser(force = false) {
    if (force || !authPromise) {
      authPromise = fetchCurrentUser().catch(() => null);
    }
    return authPromise;
  }

  function applyMenuUser(user) {
    const menu = document.getElementById("menu");
    if (!menu) return;
    menu.innerHTML = renderNavItems(user);
    menu.dataset.authRole = (user && user.role) || "visitor";
  }

  function setCurrentUser(user) {
    authPromise = Promise.resolve(user || null);
    applyMenuUser(user || null);
  }

  async function refreshNav(force = false) {
    const user = await getCurrentUser(force);
    applyMenuUser(user);
    return user;
  }

  async function performLogout() {
    const C = window.BK_CONFIG || {};
    if (window.BK_ACCOUNT_API && typeof window.BK_ACCOUNT_API.logout === "function") {
      await window.BK_ACCOUNT_API.logout();
    } else if (C.API_BASE && !C.USE_SAMPLE_DATA) {
      let token = "";
      if (C.CSRF_PATH) {
        const cr = await fetch(C.API_BASE + C.CSRF_PATH, { credentials: "include", headers: { Accept: "application/json" } });
        const cd = cr.ok ? await cr.json().catch(() => null) : null;
        token = (cd && cd.csrfToken) || "";
      }
      const headers = { Accept: "application/json" };
      if (token && C.CSRF_HEADER) headers[C.CSRF_HEADER] = token;
      const outRes = await fetch(C.API_BASE + "/auth/logout", { method: "POST", credentials: "include", headers });
      if (!outRes.ok) throw new Error("Could not sign out.");
      if (window.BK_HTTP) window.BK_HTTP.resetCsrf();
    }
    setCurrentUser(null);
  }

  function openLoginRequiredModal({ action = "", propertyId = "", next = "" } = {}) {
    closeModal();
    const root = getRoot();
    const rawNext = next || (location.pathname + location.search + location.hash);
    const params = new URLSearchParams();
    params.set("next", rawNext);
    if (action) params.set("action", action);
    if (propertyId) params.set("propertyId", propertyId);
    params.set("role", "customer");
    const authUrl = `${resolveHref(root, "login.html")}?${params.toString()}`;

    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.id = "modal-bg";
    bg.innerHTML = `
      <div class="modal bk-login-modal" role="dialog" aria-modal="true" aria-labelledby="mt">
        <div class="bk-modal-head">
          <h2 id="mt">Login Required</h2>
          <button type="button" class="bk-modal-x" data-close aria-label="Close">×</button>
        </div>
        <p class="bk-login-modal-msg">You need to log in or create an account to continue with this action.</p>
        <div class="bk-login-modal-actions">
          <a class="btn" id="bk-login-req-go" href="${esc(authUrl)}">Login / Register</a>
          <button type="button" class="btn outline" data-close>Continue Browsing</button>
        </div>
      </div>`;

    bg.addEventListener("click", (e) => {
      if (e.target === bg || e.target.closest("[data-close]")) closeModal();
    });

    document.body.append(bg);
    (bg.querySelector("#bk-login-req-go") || bg).focus();
    return bg;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = getRoot();
    const h = document.getElementById("site-header");
    const f = document.getElementById("site-footer");

    if (h) h.outerHTML = header();
    if (f) f.outerHTML = footer();

    if (root) {
      document.querySelectorAll(
        ".site-header a[href], .site-footer a[href]"
      ).forEach((a) => {
        const href = a.getAttribute("href");
        if (href && !/^(#|https?:|mailto:|tel:|\/)/.test(href)) {
          a.setAttribute("href", root + href);
        }
      });
    }

    const toggle = document.querySelector(".nav-toggle");
    toggle?.addEventListener("click", () => {
      const menu = document.getElementById("menu");
      if (!menu) return;

      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", async (e) => {
      const outBtn = e.target.closest("[data-nav-logout]");
      if (!outBtn) return;
      outBtn.disabled = true;
      try {
        await performLogout();
        const menu = document.getElementById("menu");
        if (menu?.classList.contains("open")) {
          menu.classList.remove("open");
          document.querySelector(".nav-toggle")?.setAttribute("aria-expanded", "false");
        }
        toast("Signed out.");
        const p = location.pathname;
        if (/\/(dashboard|property-form)\.html$/i.test(p)) {
          const fallback = /\/admin\//i.test(p) ? resolveHref(root, "admin/login.html") : resolveHref(root, "login.html");
          location.href = document.body?.dataset?.login || fallback;
        }
      } catch (err) {
        outBtn.disabled = false;
        toast((err && err.message) || "Could not sign out.");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    refreshNav(false);
  });

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) refreshNav(true);
  });

  return {
    esc,
    taka,
    badge,
    header,
    footer,
    propertyCard,
    openModal,
    closeModal,
    toast,
    field,
    getCurrentUser,
    setCurrentUser,
    refreshNav,
    performLogout,
    openLoginRequiredModal
  };
})();
