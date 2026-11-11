(async () => {
  const e = BK.esc;
  const box = document.getElementById("listing-box");
  const bookingBox = document.getElementById("booking-box");
  const bookingBadge = document.getElementById("nav-bookings");
  let listings = [];
  let bookings = [];

  const slug = s => s.toLowerCase().replace(/\s+/g, "-");

  function renderStats(s) {
    document.getElementById("stats").innerHTML = [
      [s.activeListings, "Active listings"], [s.pendingListings, "Pending review"], [s.views, "Total views"], [s.inquiries, "Inquiries"]
    ].map(x => `<div class="stat"><strong>${e(x[0])}</strong><span>${x[1]}</span></div>`).join("");
  }

  function renderListings() {
    box.innerHTML = listings.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Rent</th><th>Status</th><th>Views</th><th>Inquiries</th><th>Actions</th></tr></thead><tbody>${listings.map(l => {
        const canToggle = l.status === "Active" || l.status === "Paused";
        const canEdit = l.status !== "Booked";
        return `<tr><td><strong>${e(l.title)}</strong><br><small>${e(l.area)}</small></td><td>${BK.taka(l.rent)}</td>
        <td><span class="status ${slug(l.status)}">${e(l.status)}</span></td><td>${e(l.views)}</td><td>${e(l.inquiries)}</td>
        <td><div class="actions">
          ${canEdit ? `<a class="btn outline sm" href="property-form.html?id=${encodeURIComponent(l.id)}">Edit</a>` : ""}
          ${canToggle ? `<button type="button" class="btn outline sm" data-toggle="${e(l.id)}">${l.status === "Active" ? "Pause" : "Resume"}</button>` : ""}
          ${l.status !== "Booked" ? `<button type="button" class="btn danger sm" data-delete="${e(l.id)}">Delete</button>` : ""}</div></td></tr>`;
      }).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No listings yet</h3><p>Add your first property to start receiving inquiries.</p><a class="btn" href="property-form.html">Add property</a></div>`;
  }

  function renderBookings() {
    if (!bookingBox) return;
    const pendingCount = bookings.filter(b => b.status === "pending").length;
    if (bookingBadge) {
      bookingBadge.textContent = String(pendingCount);
      bookingBadge.hidden = pendingCount <= 0;
    }
    bookingBox.innerHTML = bookings.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Customer</th><th>Move-in</th><th>Note</th><th>Status</th><th>Actions</th></tr></thead><tbody>${bookings.map(b => `
        <tr>
          <td><strong>${e(b.propertyTitle)}</strong><br><small>${e(b.propertyArea)}${b.propertyRent ? ` · ${BK.taka(b.propertyRent)}/mo` : ""}</small></td>
          <td>${e(b.customerName || "Customer")}${b.customerPhone ? `<br><small>${e(b.customerPhone)}</small>` : ""}</td>
          <td>${e(b.moveInDate)}${b.moveOutDate ? `<br><small>to ${e(b.moveOutDate)}</small>` : ""}</td>
          <td>${e(b.message || "–")}</td>
          <td><span class="status ${e(b.status)}">${e(b.statusLabel || b.status)}</span></td>
          <td><div class="actions">
            ${b.status === "pending" ? `<button type="button" class="btn sm" data-confirm-bk="${e(b.id)}">Confirm</button><button type="button" class="btn danger sm" data-reject-bk="${e(b.id)}">Reject</button>` : ""}
            ${b.status === "confirmed" ? `<button type="button" class="btn danger sm" data-cancel-bk="${e(b.id)}">Cancel</button>` : ""}
            ${b.status !== "pending" && b.status !== "confirmed" ? "–" : ""}
          </div></td>
        </tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No booking requests yet</h3><p>Customer booking requests for your properties will appear here.</p></div>`;
  }

  function renderInquiries(list) {
    document.getElementById("inq-box").innerHTML = list.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>From</th><th>Message</th><th>Sent</th></tr></thead><tbody>${list.map(i =>
          `<tr><td>${e(i.propertyTitle)}</td><td>${e(i.fromName)}${i.phone ? `<br><small>${e(i.phone)}</small>` : ""}</td><td>${e(i.message)}</td><td>${e(i.sentAt)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No inquiries yet</h3></div>`;
  }

  async function reloadData() {
    const [o, bkRes] = await Promise.all([
      BK_ACCOUNT_API.getLandlordOverview(),
      BK_ACCOUNT_API.getLandlordBookings()
    ]);
    listings = o.listings;
    bookings = bkRes.items || [];
    renderStats(o.stats);
    renderListings();
    renderBookings();
    renderInquiries(o.inquiries);
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

  bookingBox?.addEventListener("click", async ev => {
    const cBtn = ev.target.closest("[data-confirm-bk]");
    const rBtn = ev.target.closest("[data-reject-bk]");
    const xBtn = ev.target.closest("[data-cancel-bk]");
    if (cBtn) {
      cBtn.disabled = true;
      try {
        await BK_ACCOUNT_API.confirmBooking(cBtn.dataset.confirmBk);
        await reloadData();
        BK.toast("Booking confirmed. Property is now marked as Booked and hidden from public search.");
      } catch (err) { cBtn.disabled = false; BK.toast(err.message || "Could not confirm booking."); }
    } else if (rBtn) {
      const m = BK.openModal("Reject booking request", `<form id="rej-form"><div class="field"><label for="rej-reason">Reason (optional)</label><input id="rej-reason" name="reason" maxlength="300"></div><button type="submit" class="btn danger">Reject booking</button></form>`);
      m.querySelector("#rej-form").onsubmit = async sEv => {
        sEv.preventDefault();
        const reason = m.querySelector("#rej-reason").value.trim();
        try {
          await BK_ACCOUNT_API.rejectBooking(rBtn.dataset.rejectBk, reason);
          BK.closeModal();
          await reloadData();
          BK.toast("Booking request rejected.");
        } catch (err) { BK.toast(err.message || "Could not reject booking."); }
      };
    } else if (xBtn) {
      const m = BK.openModal("Cancel confirmed booking?", `<p>Cancelling this confirmed booking will restore the property to public listings if no other confirmed booking exists.</p><form id="can-form"><div class="field"><label for="can-reason">Reason (optional)</label><input id="can-reason" name="reason" maxlength="300"></div><button type="submit" class="btn danger">Yes, cancel booking</button></form>`);
      m.querySelector("#can-form").onsubmit = async sEv => {
        sEv.preventDefault();
        const reason = m.querySelector("#can-reason").value.trim();
        try {
          await BK_ACCOUNT_API.cancelLandlordBooking(xBtn.dataset.cancelBk, reason);
          BK.closeModal();
          await reloadData();
          BK.toast("Booking cancelled and property availability updated.");
        } catch (err) { BK.toast(err.message || "Could not cancel booking."); }
      };
    }
  });

  if (window.BK_CHAT) {
    BK_CHAT.mount({
      container: document.getElementById("chat-box"),
      unreadBadge: document.getElementById("nav-unread")
    });
  }

  try {
    await reloadData();
  } catch (err) {
    box.innerHTML = `<div class="empty">Could not load your listings. Please sign in again or retry.</div>`;
    if (bookingBox) bookingBox.innerHTML = `<div class="empty">Could not load booking requests.</div>`;
  }
})();
