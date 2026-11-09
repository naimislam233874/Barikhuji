// One script for all 5 auth forms. The form's data-auth="customer-login" etc. picks the endpoint.
// No credentials are stored or logged here. A real session is created by the backend (HttpOnly cookie).
(() => {
  const form = document.querySelector("form[data-auth]");
  if (!form) return;
  const [kind, mode] = form.dataset.auth.split("-");
  const status = document.getElementById("form-status");
  const btn = form.querySelector("button[type=submit]");

  function say(msg, cls) { status.textContent = msg; status.className = "notice " + (cls || ""); status.hidden = false; }
  function setErr(id, msg) {
    const el = document.getElementById(id);
    document.getElementById(id + "-err").textContent = msg;
    el.closest(".field").classList.toggle("invalid", !!msg);
    el.setAttribute("aria-invalid", !!msg);
  }

  BK_VALIDATE(form, async data => {
    if (mode === "register") {
      const mismatch = data.password !== data.confirmPassword;
      setErr("confirmPassword", mismatch ? "Passwords do not match." : "");
      setErr("terms", form.elements.terms.checked ? "" : "You must accept the Terms and Privacy Policy.");
      if (mismatch || !form.elements.terms.checked) return;
    }
    delete data.confirmPassword; delete data.terms;
    btn.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.auth(kind, mode, data);
      if (res.notConnected) say("Your details look valid, but the backend is not connected yet, so nothing was sent and no account or session was created.");
      else location.href = form.dataset.redirect;
    } catch (e) { say(e.message, "bad"); }
    btn.disabled = false;
  });
})();