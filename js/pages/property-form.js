(async () => {
  const form = document.getElementById("pform");
  const status = document.getElementById("form-status");
  const id = new URLSearchParams(location.search).get("id");
  const scalar = ["title", "type", "furnished", "city", "area", "rent", "deposit", "bedrooms", "bathrooms", "availableFrom", "description"];
  const MAX_FILES = 8, MAX_BYTES = 5 * 1024 * 1024, OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

  function say(msg, cls) { status.textContent = msg; status.className = "notice " + (cls || ""); status.hidden = false; }
  function setErr(elId, msg) {
    document.getElementById(elId + "-err").textContent = msg;
    const el = document.getElementById(elId) || form.elements[elId];
    el?.closest?.(".field")?.classList.toggle("invalid", !!msg);
  }
  const checked = name => [...form.querySelectorAll(`[name=${name}]:checked`)].map(c => c.value);

  if (window.BK_CONFIG.USE_SAMPLE_DATA) {
    const n = document.getElementById("preview-note");
    n.textContent = "Preview mode: submitting only validates the form. Nothing is saved or uploaded.";
    n.hidden = false;
  }

  // Edit mode: load the existing listing. (The server must also verify the landlord owns it.)
  if (id) {
    document.getElementById("form-title").textContent = "Edit property";
    document.title = "Edit Property – Barikhuji";
    form.elements.images.required = false;
    form.querySelector("label[for=images]").textContent = "Add or replace photos (optional, JPG, PNG or WebP, up to 8, 5 MB each)";
    const p = await BK_API.getProperty(id);
    if (!p) { form.hidden = true; say("This property could not be found.", "bad"); return; }
    scalar.forEach(n => { if (p[n] !== undefined) form.elements[n].value = p[n]; });
    form.querySelectorAll("[name=suitableFor]").forEach(c => c.checked = p.suitableFor.includes(c.value));
    form.querySelectorAll("[name=amenities]").forEach(c => c.checked = p.amenities.includes(c.value));
  }

  BK_VALIDATE(form, async () => {
    let ok = true;
    const bad = (field, msg) => { setErr(field, msg); ok = false; };
    ["suitableFor", "images", "bedrooms", "bathrooms", "rent", "deposit"].forEach(f => setErr(f, ""));

    if (!checked("suitableFor").length) bad("suitableFor", "Select at least one option.");
    if (+form.elements.rent.value <= 0) bad("rent", "Rent must be greater than 0.");
    if (+form.elements.deposit.value < 0) bad("deposit", "Deposit cannot be negative.");
    ["bedrooms", "bathrooms"].forEach(f => {
      const v = +form.elements[f].value;
      if (!Number.isInteger(v) || v < 1 || v > 10) bad(f, "Enter a whole number from 1 to 10.");
    });
    const files = [...form.elements.images.files];
    if (files.length > MAX_FILES) bad("images", `Upload at most ${MAX_FILES} photos.`);
    else if (files.some(f => !OK_TYPES.includes(f.type))) bad("images", "Only JPG, PNG or WebP images are allowed.");
    else if (files.some(f => f.size > MAX_BYTES)) bad("images", "Each photo must be 5 MB or smaller.");
    if (!ok) { form.querySelector(".err:not(:empty)")?.closest(".field")?.querySelector("input,select,textarea")?.focus(); return; }

    // multipart payload: repeated keys for suitableFor and amenities, files under "images"
    const fd = new FormData();
    scalar.forEach(n => fd.append(n, form.elements[n].value.trim()));
    checked("suitableFor").forEach(v => fd.append("suitableFor", v));
    checked("amenities").forEach(v => fd.append("amenities", v));
    files.forEach(f => fd.append("images", f));

    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.saveListing(fd, id);
      if (res.saved) { location.href = "dashboard.html#listings"; return; }
      say("The form is valid, but the backend is not connected yet, so this listing was not saved or uploaded.");
    } catch (e) { say(e.message, "bad"); }
    btn.disabled = false;
  });
})();