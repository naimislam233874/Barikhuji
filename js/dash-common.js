// Shared by all three dashboards: accessible tabs, preview banner, sign-out.
(() => {
  const tabs = [...document.querySelectorAll("[role=tab]")];
  const panels = [...document.querySelectorAll("[role=tabpanel]")];
  function show(name) {
    tabs.forEach(t => { const on = t.dataset.tab === name; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    panels.forEach(p => { p.hidden = p.id !== "panel-" + name; });
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
  const h = location.hash.slice(1);
  if (tabs.length) show(tabs.some(t => t.dataset.tab === h) ? h : tabs[0].dataset.tab);

  const note = document.getElementById("preview-note");
  if (note && window.BK_CONFIG.USE_SAMPLE_DATA) {
    note.textContent = "Preview mode: the data below is sample data, no one is signed in, and nothing you do here is saved.";
    note.hidden = false;
  }

  document.getElementById("signout")?.addEventListener("click", async () => {
    try {
      const res = await BK_ACCOUNT_API.logout();
      if (res.notConnected) BK.toast("Preview mode: there is no active session.");
      else location.href = document.body.dataset.login;
    } catch (e) { BK.toast(e.message); }
  });
})();