
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

  function header() {
    const links = [
      ["browse.html", "Browse Rentals"],
      ["about.html", "About"],
      ["contact.html", "Contact"],
      ["login.html", "Login"],
      ["landlord/login.html", "Landlord"]
    ];

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
            ${links.map(([url, label]) =>
              `<a href="${url}">${label}</a>`
            ).join("")}
            <a class="btn light" href="landlord/register.html">List your property</a>
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

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.body.dataset.root || "";
    const h = document.getElementById("site-header");
    const f = document.getElementById("site-footer");

    if (h) h.outerHTML = header();
    if (f) f.outerHTML = footer();

    if (root) {
      document.querySelectorAll(
        ".site-header a[href], .site-footer a[href]"
      ).forEach((a) => {
        const href = a.getAttribute("href");
        if (href && !/^(#|https?:|mailto:|tel:)/.test(href)) {
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
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
    field
  };
})();
