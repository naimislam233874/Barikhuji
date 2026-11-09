(async () => {
  const e = BK.esc;
  const rbox = document.getElementById("review-box");
  let pending = [];

  function renderStats(s) {
    document.getElementById("stats").innerHTML = [
      [s.users, "Total users"], [s.landlords, "Landlords"], [s.activeListings, "Active listings"], [s.pendingReviews, "Pending reviews"], [s.openReports, "Open reports"]
    ].map(x => `<div class="stat"><strong>${e(x[0])}</strong><span>${x[1]}</span></div>`).join("");
  }
  function renderReviews() {
    rbox.innerHTML = pending.length
      ? `<div class="table-wrap"><table><thead><tr><th>Listing</th><th>Landlord</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>${pending.map(p => `
        <tr><td>${e(p.title)}</td><td>${e(p.landlordName)}</td><td>${e(p.submittedAt)}</td>
        <td><div class="actions"><button type="button" class="btn sm" data-decide="approved" data-id="${e(p.id)}">Approve</button>
        <button type="button" class="btn danger sm" data-decide="rejected" data-id="${e(p.id)}">Reject</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>All caught up</h3><p>No listings are waiting for review.</p></div>`;
  }
  function renderUsers(list) {
    document.getElementById("user-box").innerHTML = list.length
      ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>${list.map(u =>
          `<tr><td>${e(u.name)}</td><td>${e(u.email)}</td><td>${e(u.role)}</td><td><span class="status ${e(u.status.toLowerCase().replace(/\s+/g, "-"))}">${e(u.status)}</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No users found</h3></div>`;
  }

  rbox.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-decide]");
    if (!b) return;
    b.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.reviewListing(b.dataset.id, b.dataset.decide);
      pending = pending.filter(p => String(p.id) !== b.dataset.id); renderReviews();
      BK.toast(res.saved ? `Listing ${b.dataset.decide}.` : "Preview only: nothing was saved.");
    } catch (err) { b.disabled = false; BK.toast(err.message); }
  });

  try {
    const o = await BK_ACCOUNT_API.getAdminOverview();
    pending = o.pending; renderStats(o.stats); renderReviews(); renderUsers(o.users);
  } catch (err) { rbox.innerHTML = `<div class="empty">Could not load admin data. Please sign in again or retry.</div>`; }
})();