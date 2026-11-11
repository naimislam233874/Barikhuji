(async () => {
  const e = BK.esc;
  const grid = document.getElementById("fav-grid");
  const box = document.getElementById("inq-box");
  const bookingBox = document.getElementById("booking-box");
  let favs = [];
  let bookings = [];

  function renderFavs() {
    document.getElementById("stat-favs").textContent = favs.length;
    grid.innerHTML = favs.length
      ? favs.map(p => `<div class="fav-item">${BK.propertyCard(p)}<button type="button" class="btn outline sm" data-remove="${e(p.id)}">Remove from favorites</button></div>`).join("")
      : `<div class="empty" style="grid-column:1/-1"><h3>No favorites yet</h3><p>Save rentals you like and they will show up here.</p><a class="btn" href="browse.html">Browse rentals</a></div>`;
  }

  function renderBookings() {
    document.getElementById("stat-bookings").textContent = bookings.length;
    if (!bookingBox) return;
    bookingBox.innerHTML = bookings.length
      ? `<div class="table-wrap"><table><thead><tr><th>Property</th><th>Move-in</th><th>Landlord</th><th>Status</th><th>Actions</th></tr></thead><tbody>${bookings.map(b => {
          const canOpen = b.propertyStatus === "active";
          const titleHtml = canOpen
            ? `<a href="property.html?id=${encodeURIComponent(b.propertyId)}">${e(b.propertyTitle)}</a>`
            : `<strong>${e(b.propertyTitle)}</strong>`;
          return `<tr>
            <td>${titleHtml}<br><small>${e(b.propertyArea)}${b.propertyRent ? ` · ${BK.taka(b.propertyRent)}/mo` : ""}</small></td>
            <td>${e(b.moveInDate)}${b.moveOutDate ? `<br><small>to ${e(b.moveOutDate)}</small>` : ""}</td>
            <td>${e(b.landlordName || "Landlord")}</td>
            <td><span class="status ${e(b.status)}">${e(b.statusLabel || b.status)}</span>${b.rejectionReason ? `<br><small>${e(b.rejectionReason)}</small>` : ""}</td>
            <td>${["pending", "confirmed"].includes(b.status) ? `<button type="button" class="btn danger sm" data-cancel-booking="${e(b.id)}">Cancel</button>` : "–"}</td>
          </tr>`;
        }).join("")}</tbody></table></div>`
      : `<div class="empty"><h3>No bookings yet</h3><p>When you request a booking on a property, you can track and manage it here.</p><a class="btn" href="browse.html">Browse rentals</a></div>`;
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

  bookingBox?.addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-cancel-booking]");
    if (!btn) return;
    const b = bookings.find(x => String(x.id) === btn.dataset.cancelBooking);
    if (!b) return;
    const m = BK.openModal("Cancel booking?", `<p>Cancel your ${e(b.status)} booking for <strong>${e(b.propertyTitle)}</strong>?</p><button type="button" class="btn danger" id="confirm-cancel">Yes, cancel booking</button> `);
    m.querySelector("#confirm-cancel").onclick = async () => {
      try {
        const res = await BK_ACCOUNT_API.cancelMyBooking(b.id);
        BK.closeModal();
        if (res.booking) {
          bookings = bookings.map(x => (String(x.id) === String(b.id) ? res.booking : x));
          renderBookings();
        }
        BK.toast("Booking cancelled.");
      } catch (err) { BK.toast(err.message || "Could not cancel booking."); }
    };
  });

  if (window.BK_CHAT) {
    const convParam = new URLSearchParams(location.search).get("conv");
    BK_CHAT.mount({
      container: document.getElementById("chat-box"),
      unreadBadge: document.getElementById("nav-unread"),
      initialConversationId: convParam
    });
  }

  try {
    const [f, inqs, bks] = await Promise.all([
      BK_ACCOUNT_API.getFavorites(),
      BK_ACCOUNT_API.getInquiries(),
      BK_ACCOUNT_API.getMyBookings()
    ]);
    favs = f; bookings = bks;
    renderFavs();
    renderBookings();
    renderInquiries(inqs);
  } catch (err) {
    grid.innerHTML = box.innerHTML = `<div class="empty">Could not load your data. Please sign in again or retry.</div>`;
    if (bookingBox) bookingBox.innerHTML = `<div class="empty">Could not load bookings.</div>`;
  }
})();
