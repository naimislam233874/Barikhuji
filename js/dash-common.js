// Shared by all three dashboards: accessible tabs, preview banner, sign-out, session role guard.
(() => {
  const tabs = [...document.querySelectorAll("[role=tab]")];
  const panels = [...document.querySelectorAll("[role=tabpanel]")];
  function show(name) {
    tabs.forEach(t => { const on = t.dataset.tab === name; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    panels.forEach(p => { p.hidden = p.id !== "panel-" + name; });
  }
  function showFromHash() {
    const h = location.hash.slice(1);
    if (tabs.length) show(tabs.some(t => t.dataset.tab === h) ? h : tabs[0].dataset.tab);
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => { show(t.dataset.tab); history.replaceState(null, "", "#" + t.dataset.tab); });
    t.addEventListener("keydown", e => {
      const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!move) return;
      e.preventDefault();
      const n = tabs[(i + move + tabs.length) % tabs.length]; n.focus(); n.click();
    });
  });
  showFromHash();
  window.addEventListener("hashchange", showFromHash);

  const note = document.getElementById("preview-note");
  if (note && window.BK_CONFIG.USE_SAMPLE_DATA) {
    note.textContent = "Preview mode: the data below is sample data, no one is signed in, and nothing you do here is saved.";
    note.hidden = false;
  }

  document.getElementById("signout")?.addEventListener("click", async () => {
    try {
      const res = await BK_ACCOUNT_API.logout();
      if (res.notConnected) BK.toast("Preview mode: there is no active session.");
      else {
        if (window.BK?.setCurrentUser) BK.setCurrentUser(null);
        location.href = document.body.dataset.login;
      }
    } catch (e) { BK.toast(e.message); }
  });

  if (!window.BK_CONFIG?.USE_SAMPLE_DATA && window.BK?.getCurrentUser) {
    (async () => {
      const path = location.pathname;
      const expected = /\/admin\//i.test(path) ? "admin" : /\/landlord\//i.test(path) ? "landlord" : "customer";
      const root = document.body?.dataset?.root || "";
      const user = await BK.getCurrentUser(true);
      if (!user) {
        const loginHref = expected === "admin"
          ? "login.html"
          : `${root}login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}&role=${encodeURIComponent(expected)}`;
        location.replace(loginHref);
        return;
      }
      if (user.role !== expected) {
        const homeByRole = {
          customer: `${root}dashboard.html`,
          landlord: `${root}landlord/dashboard.html`,
          admin: `${root}admin/dashboard.html`
        };
        location.replace(homeByRole[user.role] || `${root}index.html`);
      }
    })();
  }
})();