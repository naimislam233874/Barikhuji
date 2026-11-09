// Usage: BK_VALIDATE(formEl, onValid). Client-side only; the server must re-validate.
window.BK_VALIDATE = (form, onValid) => {
  form.noValidate = true;
  form.addEventListener("submit", e => {
    e.preventDefault();
    let ok = true;
    form.querySelectorAll("input,select,textarea").forEach(el => {
      let msg = "";
      const v = el.value.trim();
      if (el.required && !v) msg = "This field is required.";
      else if (v && el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = "Enter a valid email address.";
      else if (v && el.dataset.bdphone !== undefined && !/^(\+?88)?01[3-9]\d{8}$/.test(v)) msg = "Enter a valid Bangladeshi mobile number.";
      else if (v && el.minLength > 0 && v.length < el.minLength) msg = `Use at least ${el.minLength} characters.`;
      const err = document.getElementById(el.id + "-err");
      if (err) err.textContent = msg;
      el.closest(".field")?.classList.toggle("invalid", !!msg);
      el.setAttribute("aria-invalid", !!msg);
      if (msg) ok = false;
    });
    if (ok) onValid(Object.fromEntries(new FormData(form)));
    else form.querySelector("[aria-invalid=true]")?.focus();
  });
};