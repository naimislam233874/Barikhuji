(async () => {
  const root = document.getElementById("detail");
  const p = await BK_API.getProperty(new URLSearchParams(location.search).get("id"));
  if (!p) { root.innerHTML = `<div class="empty"><h1>Property not found</h1><a class="btn" href="browse.html">Back to browse</a></div>`; return; }
  document.title = p.title + " – Barikhuji";
  const e = BK.esc;
  root.innerHTML = `<p><a href="browse.html">← Back to results</a></p><h1>${e(p.title)}</h1>
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
      <button class="btn" id="inquire" style="width:100%">Send inquiry</button><br><br>
      <button class="btn outline" id="call" style="width:100%">Show phone number</button></div>
    <div class="panel"><h2>Landlord</h2><p><strong>${e(p.landlord.name)}</strong> ${p.landlord.verified ? BK.badge("✓ Verified", "ok") : ""}</p>
      <p>Typically replies: ${e(p.landlord.responseTime)}</p></div></aside></div>`;
  const main = document.getElementById("main-img");
  root.querySelectorAll(".thumbs button").forEach(b => b.onclick = () => {
    main.src = p.images[b.dataset.i]; root.querySelectorAll(".thumbs button").forEach(x => x.removeAttribute("aria-current")); b.setAttribute("aria-current", "true");
  });
  document.getElementById("call").onclick = () => BK.openModal("Phone number", "<p>The landlord's phone number will be provided by the backend API. Phase 1 stores no contact data.</p>");
  document.getElementById("inquire").onclick = () => {
    const m = BK.openModal("Contact landlord", `<form id="inq" novalidate>${BK.field({ id: "name", label: "Your name", required: true })}
      ${BK.field({ id: "phone", label: "Mobile number", type: "tel", required: true, attrs: "data-bdphone" })}
      <div class="field"><label for="message">Message *</label><textarea id="message" name="message" rows="3" required minlength="10"></textarea><span class="err" id="message-err" aria-live="polite"></span></div>
      <button class="btn" type="submit">Send</button></form>`);
    BK_VALIDATE(m.querySelector("#inq"), async data => {
      await BK_API.sendInquiry({ propertyId: p.id, ...data });
      BK.closeModal(); BK.toast("Form is valid. Not saved: backend not connected yet.");
    });
  };
})();