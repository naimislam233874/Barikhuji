(() => {
  const form = document.getElementById("filters"), sort = document.getElementById("sort");
  const params = new URLSearchParams(location.search);
  // Restore state from URL so results are shareable and the back button works.
  [...form.elements].forEach(el => { if (el.name && el.type !== "checkbox" && params.get(el.name)) el.value = params.get(el.name); });
  const am = (params.get("amenities") || "").split(",");
  form.querySelectorAll("[name=amenity]").forEach(c => c.checked = am.includes(c.value));
  sort.value = params.get("sort") || "";

  function push(page = 1) {
    const q = new URLSearchParams();
    [...form.elements].forEach(el => { if (el.name && el.name !== "amenity" && el.value) q.set(el.name, el.value); });
    const a = [...form.querySelectorAll("[name=amenity]:checked")].map(c => c.value);
    if (a.length) q.set("amenities", a.join(","));
    if (sort.value) q.set("sort", sort.value);
    q.set("page", page);
    history.pushState({}, "", "?" + q); render();
  }
  async function render() {
    const q = Object.fromEntries(new URLSearchParams(location.search));
    const box = document.getElementById("results");
    box.setAttribute("aria-busy", "true");
    try {
      const r = await BK_API.getProperties(q);
      document.getElementById("count").textContent = `${r.total} ${r.total === 1 ? "property" : "properties"} found`;
      box.innerHTML = r.items.length ? r.items.map(BK.propertyCard).join("")
        : `<div class="empty" style="grid-column:1/-1"><h2>No rentals match your filters</h2><p>Try widening your budget or clearing filters.</p><button class="btn" id="empty-clear">Clear filters</button></div>`;
      document.getElementById("empty-clear")?.addEventListener("click", clear);
      const pg = document.getElementById("pager"); pg.innerHTML = "";
      if (r.pages > 1) for (let i = 1; i <= r.pages; i++) {
        const b = document.createElement("button"); b.textContent = i; b.setAttribute("aria-label", "Page " + i);
        if (i === r.page) b.setAttribute("aria-current", "true"); b.onclick = () => push(i); pg.append(b);
      }
    } catch (e) { box.innerHTML = `<div class="empty">Something went wrong loading results. Please retry.</div>`; }
    box.removeAttribute("aria-busy");
  }
  function clear() { form.reset(); sort.value = ""; history.pushState({}, "", location.pathname); render(); }
  form.addEventListener("submit", e => { e.preventDefault(); push(); });
  document.getElementById("clear").addEventListener("click", clear);
  sort.addEventListener("change", () => push());
  window.addEventListener("popstate", render);
  render();
})();