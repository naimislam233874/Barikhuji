(async () => {
  const e = BK.esc;
  const rbox = document.getElementById("review-box");
  const propBox = document.getElementById("prop-box");
  const propFilter = document.getElementById("prop-status-filter");
  const userRoleFilter = document.getElementById("user-role-filter");
  const bookingBox = document.getElementById("booking-box");
  const userBox = document.getElementById("user-box");
  const reportBox = document.getElementById("report-box");
  const historyBox = document.getElementById("history-box");

  let pending = [];
  let users = [];
  let properties = [];
  let bookings = [];
  let reports = [];
  let history = [];

  const slug = s => String(s || "").toLowerCase().replace(/[\s_]+/g, "-");

  function renderStats(s) {
    document.getElementById("stats").innerHTML = [
      [s.users, "Total users"], [s.landlords, "Landlords"], [s.activeListings, "Active listings"], [s.pendingReviews, "Pending reviews"], [s.openReports, "Open reports"]
    ].map(x => `<div class="stat"><strong>${e(x[0])}</strong><span>${x[1]}</span></div>`).join("");
  }

  function renderReviews() {
    rbox.innerHTML = pending.length
      ? `<div class="table-wrap"><table><thead><tr><th>Listing</th><th>Landlord</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>${pending.map(p => `
        <tr><td>${e(p.title)}</td><td>${e(p.landlordName)}</td><td>${e(p.submittedAt)}</td>
        <td><div class="actions"><button type="button" class="btn outline sm" data-admin-view-prop="${e(p.id)}">View</button>
        <button type="button" class="btn sm" data-decide="approved" data-id="${e(p.id)}">Approve</button>
        <button type="button" class="btn danger sm" data-decide="rejected" data-id="${e(p.id)}">Reject</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>All caught up</h3><p>No listings are waiting for review.</p></div>`;
  }

  function renderProperties() {
    if (!propBox) return;
    propBox.innerHTML = properties.length
      ? `<div class="table-wrap"><table><thead><tr><th>Listing</th><th>Landlord</th><th>Rent</th><th>Status</th><th>Booking / Flags</th><th>Actions</th></tr></thead><tbody>${properties.map(p => `
        <tr>
          <td><strong>${e(p.title)}</strong><br><small>${e(p.area)}, ${e(p.city)}</small></td>
          <td>${e(p.landlord ? p.landlord.name : "Landlord")}<br><small>${e(p.landlord ? p.landlord.email : "")}</small></td>
          <td>${BK.taka(p.rent)}</td>
          <td><span class="status ${slug(p.status)}">${e(p.statusLabel || p.status)}</span></td>
          <td>
            ${p.verified ? BK.badge("Verified", "ok") : ""}
            ${p.featured ? BK.badge("Featured") : ""}
            ${p.activeBooking ? `<br><small>Booked by ${e(p.activeBooking.customerName)} (${e(p.activeBooking.moveInDate)})</small>` : ""}
          </td>
          <td><div class="actions">
            <button type="button" class="btn outline sm" data-admin-view-prop="${e(p.id)}">View</button>
            <button type="button" class="btn outline sm" data-flag-verified="${e(p.id)}" data-val="${p.verified ? "0" : "1"}">${p.verified ? "Unverify" : "Verify"}</button>
            <button type="button" class="btn outline sm" data-flag-featured="${e(p.id)}" data-val="${p.featured ? "0" : "1"}">${p.featured ? "Unfeature" : "Feature"}</button>
          </div></td>
        </tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No properties found</h3></div>`;
  }

  function renderBookings() {
    if (!bookingBox) return;
    bookingBox.innerHTML = bookings.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Customer</th><th>Landlord</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead><tbody>${bookings.map(b => `
        <tr>
          <td><strong>${e(b.propertyTitle)}</strong><br><small>${e(b.propertyArea)} (${e(b.propertyStatus)})</small></td>
          <td>${e(b.customerName || "")}<br><small>${e(b.customerEmail || "")}</small></td>
          <td>${e(b.landlordName || "")}<br><small>${e(b.landlordEmail || "")}</small></td>
          <td>${e(b.moveInDate)}${b.moveOutDate ? `<br><small>to ${e(b.moveOutDate)}</small>` : ""}</td>
          <td><span class="status ${slug(b.status)}">${e(b.statusLabel || b.status)}</span></td>
          <td>${["pending", "confirmed"].includes(b.status) ? `<button type="button" class="btn danger sm" data-admin-cancel-bk="${e(b.id)}">Cancel</button>` : "–"}</td>
        </tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No bookings recorded</h3></div>`;
  }

  function renderUsers() {
    userBox.innerHTML = users.length
      ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${users.map(u => {
        const statusKey = u.statusKey || slug(u.status).replace(/-/g, "_");
        const roleKey = u.roleKey || String(u.role || "").toLowerCase();
        const actions = [];
        if (roleKey !== "admin") {
          if (statusKey !== "active") actions.push(`<button type="button" class="btn sm" data-user-status="active" data-uid="${e(u.id)}">${statusKey === "pending_verification" ? "Verify" : "Activate"}</button>`);
          if (statusKey !== "suspended") actions.push(`<button type="button" class="btn danger sm" data-user-status="suspended" data-uid="${e(u.id)}">Suspend</button>`);
        }
        return `<tr><td>${e(u.name)}</td><td>${e(u.email)}</td><td>${e(u.role)}</td><td><span class="status ${slug(u.status)}">${e(u.status)}</span></td><td><div class="actions">${actions.length ? actions.join("") : "–"}</div></td></tr>`;
      }).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No users found</h3></div>`;
  }

  function renderReports() {
    if (!reportBox) return;
    reportBox.innerHTML = reports.length
      ? `<div class="table-wrap"><table><thead><tr><th>From</th><th>Topic</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>${reports.map(r => `
        <tr>
          <td>${e(r.name)}<br><small>${e(r.email)}</small></td>
          <td>${e(r.subject)}</td>
          <td>${e(r.message)}</td>
          <td><span class="status ${slug(r.status)}">${e(r.status)}</span></td>
          <td><button type="button" class="btn outline sm" data-report-id="${e(r.id)}" data-report-next="${r.status === "open" ? "resolved" : "open"}">${r.status === "open" ? "Resolve" : "Reopen"}</button></td>
        </tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No reports or messages</h3></div>`;
  }

  function renderHistory() {
    if (!historyBox) return;
    historyBox.innerHTML = history.length
      ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Transition</th><th>Note</th></tr></thead><tbody>${history.map(h => `
        <tr>
          <td>${e(String(h.createdAt || "").slice(0, 16).replace("T", " "))}</td>
          <td>${e(h.adminName)}</td>
          <td>${e(h.action)}</td>
          <td>${e(h.targetLabel || h.targetId)}</td>
          <td>${h.previousStatus || h.newStatus ? `${e(h.previousStatus)} → ${e(h.newStatus)}` : "–"}</td>
          <td>${e(h.note || "–")}</td>
        </tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No moderation actions yet</h3></div>`;
  }

  async function loadAll() {
    const o = await BK_ACCOUNT_API.getAdminOverview();
    pending = o.pending;
    users = userRoleFilter && userRoleFilter.value
      ? await BK_ACCOUNT_API.getAdminUsers(userRoleFilter.value)
      : o.users;
    renderStats(o.stats);
    renderReviews();
    renderUsers();

    if (!window.BK_CONFIG.USE_SAMPLE_DATA) {
      const [props, bks, reps, hist] = await Promise.all([
        BK_ACCOUNT_API.getAdminProperties(propFilter ? propFilter.value : ""),
        BK_ACCOUNT_API.getAdminBookings(),
        BK_ACCOUNT_API.getAdminReports(),
        BK_ACCOUNT_API.getAdminModerationHistory()
      ]);
      properties = props;
      bookings = bks;
      reports = reps;
      history = hist;
      renderProperties();
      renderBookings();
      renderReports();
      renderHistory();
    }
  }

  async function openPropertyDetailModal(id) {
    try {
      const p = await BK_ACCOUNT_API.getAdminProperty(id);
      if (!p) { BK.toast("Property not found."); return; }
      const imgs = (p.images || []).map(u => `<div class="bk-img-item"><img src="${e(u)}" alt=""></div>`).join("");
      const bks = (p.bookings || []).length
        ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Move-in</th><th>Status</th></tr></thead><tbody>${p.bookings.map(b =>
            `<tr><td>${e(b.customerName)}<br><small>${e(b.customerEmail || "")}</small></td><td>${e(b.moveInDate)}</td><td><span class="status ${slug(b.status)}">${e(b.status)}</span></td></tr>`
          ).join("")}</tbody></table></div>`
        : "<p><small>No bookings recorded for this property.</small></p>";
      BK.openModal(p.title, `
        <p><span class="status ${slug(p.status)}">${e(p.statusLabel || p.status)}</span> ${p.verified ? BK.badge("Verified", "ok") : ""} ${p.featured ? BK.badge("Featured") : ""}</p>
        <p><strong>${e(p.area)}, ${e(p.city)}</strong> · ${BK.taka(p.rent)}/mo (Deposit ${BK.taka(p.deposit)})</p>
        <p>${e(p.type)} · ${e(p.bedrooms)} bed · ${e(p.bathrooms)} bath · ${e(p.furnished)} · Available ${e(p.availableFrom)}</p>
        <p>${e(p.description)}</p>
        ${p.landlord ? `<p><strong>Landlord:</strong> ${e(p.landlord.name)} (${e(p.landlord.email)}${p.landlord.phone ? `, ${e(p.landlord.phone)}` : ""}) – ${e(p.landlord.status)}</p>` : ""}
        ${imgs ? `<div class="bk-img-grid">${imgs}</div>` : ""}
        <h3 style="margin:.9rem 0 .4rem">Bookings (${(p.bookings || []).length})</h3>
        ${bks}
      `);
    } catch (err) { BK.toast(err.message || "Could not load property details."); }
  }

  rbox.addEventListener("click", async ev => {
    const viewBtn = ev.target.closest("[data-admin-view-prop]");
    if (viewBtn) { openPropertyDetailModal(viewBtn.dataset.adminViewProp); return; }
    const b = ev.target.closest("[data-decide]");
    if (!b) return;
    b.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.reviewListing(b.dataset.id, b.dataset.decide);
      if (res.saved) await loadAll();
      else { pending = pending.filter(p => String(p.id) !== b.dataset.id); renderReviews(); }
      BK.toast(res.saved ? `Listing ${b.dataset.decide}.` : "Preview only: nothing was saved.");
    } catch (err) { b.disabled = false; BK.toast(err.message); }
  });

  propFilter?.addEventListener("change", async () => {
    try {
      properties = await BK_ACCOUNT_API.getAdminProperties(propFilter.value);
      renderProperties();
    } catch (err) { BK.toast(err.message); }
  });

  userRoleFilter?.addEventListener("change", async () => {
    try {
      users = await BK_ACCOUNT_API.getAdminUsers(userRoleFilter.value);
      renderUsers();
    } catch (err) { BK.toast(err.message); }
  });

  propBox?.addEventListener("click", async ev => {
    const viewBtn = ev.target.closest("[data-admin-view-prop]");
    if (viewBtn) { openPropertyDetailModal(viewBtn.dataset.adminViewProp); return; }
    const vBtn = ev.target.closest("[data-flag-verified]");
    const fBtn = ev.target.closest("[data-flag-featured]");
    try {
      if (vBtn) {
        await BK_ACCOUNT_API.toggleAdminPropertyFlag(vBtn.dataset.flagVerified, { verified: vBtn.dataset.val === "1" });
        await loadAll();
        BK.toast("Property verification updated.");
      } else if (fBtn) {
        await BK_ACCOUNT_API.toggleAdminPropertyFlag(fBtn.dataset.flagFeatured, { featured: fBtn.dataset.val === "1" });
        await loadAll();
        BK.toast("Property featured status updated.");
      }
    } catch (err) { BK.toast(err.message); }
  });

  userBox?.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-user-status]");
    if (!btn) return;
    btn.disabled = true;
    try {
      await BK_ACCOUNT_API.updateAdminUserStatus(btn.dataset.uid, btn.dataset.userStatus);
      await loadAll();
      BK.toast("User status updated.");
    } catch (err) { btn.disabled = false; BK.toast(err.message); }
  });

  bookingBox?.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-admin-cancel-bk]");
    if (!btn) return;
    const m = BK.openModal("Cancel booking?", `<p>Cancel this booking and restore property availability if applicable?</p><button type="button" class="btn danger" id="adm-can-go">Confirm cancel</button>`);
    m.querySelector("#adm-can-go").onclick = async () => {
      try {
        await BK_ACCOUNT_API.cancelAdminBooking(btn.dataset.adminCancelBk, "Cancelled by administrator");
        BK.closeModal();
        await loadAll();
        BK.toast("Booking cancelled.");
      } catch (err) { BK.toast(err.message); }
    };
  });

  reportBox?.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-report-id]");
    if (!btn) return;
    btn.disabled = true;
    try {
      await BK_ACCOUNT_API.updateAdminReportStatus(btn.dataset.reportId, btn.dataset.reportNext);
      await loadAll();
      BK.toast("Report status updated.");
    } catch (err) { btn.disabled = false; BK.toast(err.message); }
  });

  try {
    await loadAll();
  } catch (err) {
    rbox.innerHTML = `<div class="empty">Could not load admin data. Please sign in again or retry.</div>`;
  }
})();
