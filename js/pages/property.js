(async () => {
  const root = document.getElementById("detail");
  const qs = new URLSearchParams(location.search);
  const pendingAction = qs.get("pendingAction") || "";
  const p = await BK_API.getProperty(qs.get("id"));
  if (!p) { root.innerHTML = `<div class="empty"><h1>Property not found</h1><a class="btn" href="browse.html">Back to browse</a></div>`; return; }
  if (pendingAction && window.history && history.replaceState) {
    qs.delete("pendingAction");
    const cleanSearch = qs.toString();
    history.replaceState(null, "", location.pathname + (cleanSearch ? "?" + cleanSearch : "") + location.hash);
  }
  document.title = p.title + " – Barikhuji";
  const e = BK.esc; root.innerHTML = `<p><a href="browse.html">← Back to results</a></p><h1>${e(p.title)}</h1>
  <p>📍 ${e(p.area)}, ${e(p.city)} ${p.verified ? BK.badge("✓ Verified", "ok") : ""}</p>
  <div class="detail"><div>
    <img class="gallery-main" id="main-img" src="${e(p.images[0])}" alt="${e(p.title)} photo 1">
    <div class="thumbs">${p.images.map((s, i) => `<button type="button" data-i="${i}" aria-label="Show photo ${i + 1}" ${i === 0 ? 'aria-current="true"' : ""}><img src="${e(s)}" alt=""></button>`).join("")}</div>
    <div class="panel"><h2>About this property</h2><p>${e(p.description)}</p>
      <p><strong>Type:</strong> ${e(p.type)} · <strong>${p.bedrooms}</strong> bed · <strong>${p.bathrooms}</strong> bath · ${e(p.furnished)}</p>
      <p><strong>Suitable for:</strong> ${p.suitableFor.map(s => BK.badge(s)).join(" ")}</p>
      <p><strong>Available from:</strong> ${e(p.availableFrom)}</p></div>
    <div class="panel"><h2>Amenities</h2><div class="chips">${p.amenities.map(a => BK.badge(a)).join("")}</div></div>
  </div><aside>
    <div class="panel"><p class="price" style="font-size:1.6rem">${BK.taka(p.rent)}<small> /month</small></p>
      <p>Security deposit: <strong>${BK.taka(p.deposit)}</strong></p>
      <button class="btn" id="book-prop" style="width:100%">Request booking</button><br><br>
      <button class="btn outline" id="chat-prop" style="width:100%">Message landlord</button><br><br>
      <button class="btn outline" id="inquire" style="width:100%">Send inquiry</button><br><br>
      <button class="btn outline" id="save-fav" style="width:100%">Save to favorites</button><br><br>
      <button class="btn outline" id="call" style="width:100%">Show phone number</button></div>
    <div class="panel"><h2>Landlord</h2><p><strong>${e(p.landlord.name)}</strong> ${p.landlord.verified ? BK.badge("✓ Verified", "ok") : ""}</p>
      <p>Typically replies: ${e(p.landlord.responseTime)}</p></div></aside></div>`;
  const main = document.getElementById("main-img");
  root.querySelectorAll(".thumbs button").forEach(b => b.onclick = () => {
    main.src = p.images[b.dataset.i]; root.querySelectorAll(".thumbs button").forEach(x => x.removeAttribute("aria-current")); b.setAttribute("aria-current", "true");
  });

  function showRenterRequiredModal(user) {
    const roleLabel = user && user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Non-renter";
    BK.openModal("Renter account required", `<p>Only signed-in Renter accounts can perform this customer action. You are currently signed in as <strong>${e(roleLabel)}</strong>.</p>`);
  }

  async function requireSession(actionKey, { customerOnly = true } = {}) {
    if (window.BK_CONFIG && window.BK_CONFIG.USE_SAMPLE_DATA) return { role: "customer" };
    const user = await BK.getCurrentUser(true);
    if (BK.refreshNav) BK.setCurrentUser(user);
    if (!user) {
      BK.openLoginRequiredModal({ action: actionKey, propertyId: p.id });
      return null;
    }
    if (customerOnly && user.role !== "customer") {
      showRenterRequiredModal(user);
      return null;
    }
    return user;
  }

  function handle401(actionKey) {
    BK.setCurrentUser(null);
    BK.openLoginRequiredModal({ action: actionKey, propertyId: p.id });
  }

  const callBtn = document.getElementById("call");
  async function runShowPhone() {
    const user = await requireSession("call", { customerOnly: false });
    if (!user) return;
    callBtn.disabled = true;
    try {
      const info = await BK_ACCOUNT_API.getPropertyContact(p.id);
      if (info && info.previewOnly) {
        BK.openModal("Landlord phone", "<p>Preview mode: landlord contact details require the backend server.</p>");
      } else if (info && info.phone) {
        BK.openModal("Landlord contact", `<p><strong>${e(info.landlordName)}</strong> ${info.verified ? BK.badge("✓ Verified", "ok") : ""}</p><p>Phone: <a href="tel:${e(info.phone)}"><strong>${e(info.phone)}</strong></a></p>`);
      } else {
        BK.openModal("Landlord contact", `<p><strong>${e((info && info.landlordName) || p.landlord.name)}</strong></p><p>No phone number is listed for this account. Please use Message landlord or Send inquiry.</p>`);
      }
    } catch (err) {
      if (err.status === 401) handle401("call");
      else BK.toast(err.message || "Could not load landlord phone number.");
    }
    callBtn.disabled = false;
  }
  callBtn.onclick = runShowPhone;

  // Save/unsave this listing to the signed-in customer's favorites (demo mode: preview only).
  const favBtn = document.getElementById("save-fav");
  let favState = "idle"; // idle -> busy, so a double click cannot fire two POSTs
  async function runSaveFav() {
    if (favState === "busy") return;
    const user = await requireSession("fav");
    if (!user) return;
    favState = "busy"; favBtn.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.addFavorite(p.id);
      if (res.saved) {
        favBtn.textContent = "Saved to favorites ✓";
        favBtn.disabled = true;
        BK.toast("Saved to your favorites.");
      } else {
        BK.toast("Preview only: sign-in and saving are not connected yet.");
      }
    } catch (err) {
      if (err.status === 401) handle401("fav");
      else if (err.status === 403) showRenterRequiredModal(user);
      else BK.toast(err.message || "Could not save this favorite. Please try again.");
    }
    favState = "idle"; if (favBtn.textContent !== "Saved to favorites ✓") favBtn.disabled = false;
  }
  favBtn.onclick = runSaveFav;

  async function runBookModal() {
    const user = await requireSession("book");
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const m = BK.openModal("Request booking", `
      <div class="bk-booking-summary">
        <p><strong>${e(p.title)}</strong></p>
        <p>${e(p.area)}, ${e(p.city)} · <strong>${BK.taka(p.rent)}</strong>/month</p>
        <p>Security deposit: <strong>${BK.taka(p.deposit)}</strong></p>
      </div>
      <form id="book-form" novalidate>
      ${BK.field({ id: "moveInDate", label: "Move-in date", type: "date", required: true, attrs: `min="${today}"` })}
      ${BK.field({ id: "moveOutDate", label: "Move-out date (optional)", type: "date", attrs: `min="${today}"` })}
      ${BK.field({ id: "phone", label: "Mobile number (optional)", type: "tel", attrs: `data-bdphone placeholder='01XXXXXXXXX' value="${e(user.phone || "")}"` })}
      <div class="field"><label for="book-msg">Note to landlord (optional)</label><textarea id="book-msg" name="message" rows="3" maxlength="500"></textarea><span class="err" id="book-msg-err" aria-live="polite"></span></div>
      <button class="btn" type="submit">Confirm booking request</button></form>`);
    BK_VALIDATE(m.querySelector("#book-form"), async data => {
      const btn = m.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const payload = { propertyId: p.id, moveInDate: data.moveInDate };
        if (data.moveOutDate) payload.moveOutDate = data.moveOutDate;
        if (data.phone) payload.phone = data.phone;
        if (data.message && data.message.trim()) payload.message = data.message.trim();
        const res = await BK_ACCOUNT_API.createBooking(payload);
        BK.closeModal();
        BK.toast(res.saved ? "Booking request sent! Track it in your dashboard." : "Preview only: booking was not saved.");
      } catch (err) {
        btn.disabled = false;
        if (err.status === 401) { BK.closeModal(); handle401("book"); }
        else BK.toast(err.message || "Could not submit booking request.");
      }
    });
  }
  document.getElementById("book-prop").onclick = runBookModal;

  async function runChatModal() {
    const user = await requireSession("chat");
    if (!user) return;
    const m = BK.openModal("Message landlord", `<form id="chat-form" novalidate>
      <div class="field"><label for="chat-msg">Message *</label><textarea id="chat-msg" name="message" rows="3" required minlength="1" maxlength="2000" placeholder="Ask about availability, rent or viewing…"></textarea><span class="err" id="chat-msg-err" aria-live="polite"></span></div>
      <button class="btn" type="submit">Start chat</button></form>`);
    BK_VALIDATE(m.querySelector("#chat-form"), async data => {
      const btn = m.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const res = await BK_ACCOUNT_API.startConversation(p.id, data.message.trim());
        BK.closeModal();
        if (res.saved && res.conversation) {
          BK.toast("Message sent! Opening chat…");
          location.href = `dashboard.html?conv=${encodeURIComponent(res.conversation.id)}#messages`;
        } else {
          BK.toast("Preview only: chat requires backend mode.");
        }
      } catch (err) {
        btn.disabled = false;
        if (err.status === 401) { BK.closeModal(); handle401("chat"); }
        else BK.toast(err.message || "Could not start conversation.");
      }
    });
  }
  document.getElementById("chat-prop").onclick = runChatModal;

  async function runInquireModal() {
    const user = await requireSession("inquire");
    if (!user) return;
    const m = BK.openModal("Contact landlord", `<form id="inq" novalidate>${BK.field({ id: "name", label: "Your name", required: true, attrs: `value="${e(user.name || "")}"` })}
      ${BK.field({ id: "phone", label: "Mobile number", type: "tel", required: true, attrs: `data-bdphone value="${e(user.phone || "")}"` })}
      <div class="field"><label for="message">Message *</label><textarea id="message" name="message" rows="3" required minlength="10"></textarea><span class="err" id="message-err" aria-live="polite"></span></div>
      <button class="btn" type="submit">Send</button></form>`);
    BK_VALIDATE(m.querySelector("#inq"), async data => {
      try {
        const res = await BK_API.sendInquiry({ propertyId: p.id, ...data });
        BK.closeModal();
        BK.toast(res.saved ? "Your inquiry has been sent to the landlord." : "Form is valid. Not saved: backend not connected yet.");
      } catch (err) {
        if (err.status === 401) { BK.closeModal(); handle401("inquire"); }
        else BK.toast(err.message || "Could not send inquiry.");
      }
    });
  }
  document.getElementById("inquire").onclick = runInquireModal;

  if (pendingAction) {
    const handlers = {
      book: runBookModal,
      call: runShowPhone,
      chat: runChatModal,
      inquire: runInquireModal,
      fav: runSaveFav
    };
    const fn = handlers[pendingAction];
    if (fn) await fn();
  }
})();