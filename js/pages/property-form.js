(async () => {
  const form = document.getElementById("pform");
  const status = document.getElementById("form-status");
  const previewEl = document.getElementById("image-preview");
  const countEl = document.getElementById("image-count");
  const fileInput = form.elements.images;
  const id = new URLSearchParams(location.search).get("id");
  const scalar = ["title", "type", "furnished", "city", "area", "rent", "deposit", "bedrooms", "bathrooms", "availableFrom", "description"];
  const MAX_FILES = 10, MAX_BYTES = 5 * 1024 * 1024, OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const C = window.BK_CONFIG || {};
  const assetUrl = u => (!u ? "" : /^(https?:|data:|blob:)/.test(u) ? u : (C.ASSET_BASE || "") + u);

  let existingImages = [];
  let selectedFiles = []; // { file, url }

  function say(msg, cls) { status.textContent = msg; status.className = "notice " + (cls || ""); status.hidden = false; }
  function setErr(elId, msg) {
    document.getElementById(elId + "-err").textContent = msg;
    const el = document.getElementById(elId) || form.elements[elId];
    el?.closest?.(".field")?.classList.toggle("invalid", !!msg);
  }
  const checked = name => [...form.querySelectorAll(`[name=${name}]:checked`)].map(c => c.value);

  function renderPreviews() {
    const total = existingImages.length + selectedFiles.length;
    if (countEl) countEl.textContent = `${total} / ${MAX_FILES} photos selected`;
    if (!previewEl) return;

    const existingHtml = existingImages.map((url, idx) => `
      <div class="bk-img-item">
        <img src="${BK.esc(assetUrl(url))}" alt="Existing photo ${idx + 1}">
        <div class="bk-img-foot">
          <span>Saved</span>
          <button type="button" class="btn danger sm" data-rm-existing="${idx}" aria-label="Remove saved photo ${idx + 1}">Remove</button>
        </div>
      </div>`).join("");

    const newHtml = selectedFiles.map((item, idx) => `
      <div class="bk-img-item">
        <img src="${BK.esc(item.url)}" alt="${BK.esc(item.file.name)}">
        <div class="bk-img-foot">
          <span>New</span>
          <button type="button" class="btn danger sm" data-rm-new="${idx}" aria-label="Remove selected photo ${idx + 1}">Remove</button>
        </div>
      </div>`).join("");

    previewEl.innerHTML = existingHtml + newHtml;
  }

  // Managed via selectedFiles array so landlords can preview & remove individual photos before submitting.
  fileInput.required = false;
  fileInput.addEventListener("change", () => {
    const incoming = [...fileInput.files];
    fileInput.value = "";
    if (!incoming.length) return;
    setErr("images", "");

    const remaining = MAX_FILES - (existingImages.length + selectedFiles.length);
    if (incoming.length > remaining) {
      setErr("images", `You can upload at most ${MAX_FILES} photos total (${remaining} slot${remaining === 1 ? "" : "s"} remaining).`);
      return;
    }

    for (const f of incoming) {
      if (!OK_TYPES.includes(f.type)) {
        setErr("images", "Only JPG, PNG or WebP images are allowed.");
        return;
      }
      if (f.size > MAX_BYTES) {
        setErr("images", "Each photo must be 5 MB or smaller.");
        return;
      }
    }

    for (const f of incoming) {
      selectedFiles.push({ file: f, url: URL.createObjectURL(f) });
    }
    renderPreviews();
  });

  previewEl?.addEventListener("click", ev => {
    const rmEx = ev.target.closest("[data-rm-existing]");
    const rmNew = ev.target.closest("[data-rm-new]");
    if (rmEx) {
      const idx = Number(rmEx.dataset.rmExisting);
      existingImages.splice(idx, 1);
      setErr("images", "");
      renderPreviews();
    } else if (rmNew) {
      const idx = Number(rmNew.dataset.rmNew);
      const removed = selectedFiles.splice(idx, 1)[0];
      if (removed && removed.url) URL.revokeObjectURL(removed.url);
      setErr("images", "");
      renderPreviews();
    }
  });

  if (window.BK_CONFIG.USE_SAMPLE_DATA) {
    const n = document.getElementById("preview-note");
    n.textContent = "Preview mode: submitting only validates the form. Nothing is saved or uploaded.";
    n.hidden = false;
  }

  // Edit mode: load the existing listing from the owner endpoint so pending/paused/rejected/booked listings also load.
  if (id) {
    document.getElementById("form-title").textContent = "Edit property";
    document.title = "Edit Property – Barikhuji";
    form.querySelector("label[for=images]").textContent = "Add or replace photos (optional, JPG, PNG or WebP, up to 10 total, 5 MB each)";
    try {
      const p = await BK_ACCOUNT_API.getLandlordProperty(id);
      if (!p) { form.hidden = true; say("This property could not be found.", "bad"); return; }
      scalar.forEach(n => { if (p[n] !== undefined) form.elements[n].value = p[n]; });
      form.querySelectorAll("[name=suitableFor]").forEach(c => c.checked = (p.suitableFor || []).includes(c.value));
      form.querySelectorAll("[name=amenities]").forEach(c => c.checked = (p.amenities || []).includes(c.value));
      existingImages = Array.isArray(p.images) ? [...p.images] : [];
      if (p.status === "booked") {
        say("This listing currently has a confirmed booking and cannot be edited until that booking is cancelled.", "bad");
        form.querySelector("button[type=submit]").disabled = true;
      }
    } catch (e) {
      form.hidden = true;
      say(e.message || "This property could not be loaded.", "bad");
      return;
    }
  }
  renderPreviews();

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

    const totalImages = existingImages.length + selectedFiles.length;
    if (totalImages === 0) bad("images", id ? "Keep or upload at least 1 photo." : "Select at least 1 photo.");
    else if (totalImages > MAX_FILES) bad("images", `Upload at most ${MAX_FILES} photos.`);
    else if (selectedFiles.some(x => !OK_TYPES.includes(x.file.type))) bad("images", "Only JPG, PNG or WebP images are allowed.");
    else if (selectedFiles.some(x => x.file.size > MAX_BYTES)) bad("images", "Each photo must be 5 MB or smaller.");

    if (!ok) { form.querySelector(".err:not(:empty)")?.closest(".field")?.querySelector("input,select,textarea")?.focus(); return; }

    const fd = new FormData();
    scalar.forEach(n => fd.append(n, form.elements[n].value.trim()));
    checked("suitableFor").forEach(v => fd.append("suitableFor", v));
    checked("amenities").forEach(v => fd.append("amenities", v));
    if (id) {
      fd.append("keepExistingImages", "1");
      existingImages.forEach(u => fd.append("existingImages", u));
    }
    selectedFiles.forEach(x => fd.append("images", x.file));

    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.saveListing(fd, id);
      if (res.saved) { location.href = "dashboard.html#listings"; return; }
      say("The form is valid, but the backend is not connected yet, so this listing was not saved or uploaded.");
    } catch (e) { say(e.message, "bad"); }
    btn.disabled = false;
  });
})();
