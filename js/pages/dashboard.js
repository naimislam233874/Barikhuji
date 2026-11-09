(async () => {
  const e = BK.esc;
  const grid = document.getElementById("fav-grid"), box = document.getElementById("inq-box");
  let favs = [];

  function renderFavs() {
    document.getElementById("stat-favs").textContent = favs.length;
    grid.innerHTML = favs.length
      ? favs.map(p => `<div class="fav-item">${BK.propertyCard(p)}<button type="button" class="btn outline sm" data-remove="${e(p.id)}">Remove from favorites</button></div>`).join("")
      : `<div class="empty" style="grid-column:1/-1"><h3>No favorites yet</h3><p>Save rentals you like and they will show up here.</p><a class="btn" href="browse.html">Browse rentals</a></div>`;
  }
  function renderInquiries(list) {
    document.getElementById("stat-inqs").textContent = list.length;
    box.innerHTML = list.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Your message</th><th>Sent</th><th>Status</th></tr></thead><tbody>${list.map(i =>
          `<tr><td><a href="property.html?id=${encodeURIComponent(i.propertyId)}">${e(i.propertyTitle)}</a></td><td>${e(i.message)}</td><td>${e(i.sentAt)}</td><td><span class="status ${e(i.status.toLowerCase())}">${e(i.status)}</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No inquiries yet</h3><p>When you contact a landlord, the conversation history appears here.</p></div>`;
  }

  grid.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-remove]");
    if (!b) return;
    b.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.removeFavorite(b.dataset.remove);
      favs = favs.filter(p => String(p.id) !== b.dataset.remove);
      renderFavs();
      BK.toast(res.saved ? "Removed from favorites." : "Preview only: nothing was saved.");
    } catch (err) { b.disabled = false; BK.toast(err.message); }
  });

  try {
    const [f, inqs] = await Promise.all([BK_ACCOUNT_API.getFavorites(), BK_ACCOUNT_API.getInquiries()]);
    favs = f; renderFavs(); renderInquiries(inqs);
  } catch (err) {
    grid.innerHTML = box.innerHTML = `<div class="empty">Could not load your data. Please sign in again or retry.</div>`;
  }
})();