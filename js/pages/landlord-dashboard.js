(async () => {
  const e = BK.esc;
  const box = document.getElementById("listing-box");
  let listings = [];

  const slug = s => s.toLowerCase().replace(/\s+/g, "-");

  function renderStats(s) {
    document.getElementById("stats").innerHTML = [
      [s.activeListings, "Active listings"], [s.pendingListings, "Pending review"], [s.views, "Total views"], [s.inquiries, "Inquiries"]
    ].map(x => `<div class="stat"><strong>${e(x[0])}</strong><span>${x[1]}</span></div>`).join("");
  }
  function renderListings() {
    box.innerHTML = listings.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Rent</th><th>Status</th><th>Views</th><th>Inquiries</th><th>Actions</th></tr></thead><tbody>${listings.map(l => `
        <tr><td><strong>${e(l.title)}</strong><br><small>${e(l.area)}</small></td><td>${BK.taka(l.rent)}</td>
        <td><span class="status ${slug(l.status)}">${e(l.status)}</span></td><td>${e(l.views)}</td><td>${e(l.inquiries)}</td>
        <td><div class="actions">
          <a class="btn outline sm" href="property-form.html?id=${encodeURIComponent(l.id)}">Edit</a>
          ${l.status === "Pending review" ? "" : `<button type="button" class="btn outline sm" data-toggle="${e(l.id)}">${l.status === "Active" ? "Pause" : "Resume"}</button>`}
          <button type="button" class="btn danger sm" data-delete="${e(l.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No listings yet</h3><p>Add your first property to start receiving inquiries.</p><a class="btn" href="property-form.html">Add property</a></div>`;
  }
  function renderInquiries(list) {
    document.getElementById("inq-box").innerHTML = list.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>From</th><th>Message</th><th>Sent</th></tr></thead><tbody>${list.map(i =>
          `<tr><td>${e(i.propertyTitle)}</td><td>${e(i.fromName)}</td><td>${e(i.message)}</td><td>${e(i.sentAt)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No inquiries yet</h3></div>`;
  }

  box.addEventListener("click", async ev => {
    const t = ev.target.closest("[data-toggle]"), d = ev.target.closest("[data-delete]");
    try {
      if (t) {
        const l = listings.find(x => String(x.id) === t.dataset.toggle);
        const next = l.status === "Active" ? "Paused" : "Active";
        const res = await BK_ACCOUNT_API.setListingStatus(l.id, next);
        l.status = next; renderListings();
        BK.toast(res.saved ? "Listing updated." : "Preview only: nothing was saved.");
      }
      if (d) {
        const l = listings.find(x => String(x.id) === d.dataset.delete);
        const m = BK.openModal("Delete listing?", `<p>This will remove <strong>${e(l.title)}</strong>. This cannot be undone.</p><button type="button" class="btn danger" id="confirm-del">Yes, delete</button> `);
        m.querySelector("#confirm-del").onclick = async () => {
          try {
            const res = await BK_ACCOUNT_API.deleteListing(l.id);
            listings = listings.filter(x => x !== l); BK.closeModal(); renderListings();
            BK.toast(res.saved ? "Listing deleted." : "Preview only: nothing was saved.");
          } catch (err) { BK.toast(err.message); }
        };
      }
    } catch (err) { BK.toast(err.message); }
  });

  try {
    const o = await BK_ACCOUNT_API.getLandlordOverview();
    listings = o.listings; renderStats(o.stats); renderListings(); renderInquiries(o.inquiries);
  } catch (err) { box.innerHTML = `<div class="empty">Could not load your listings. Please sign in again or retry.</div>`; }
})();