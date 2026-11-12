// Handles both the unified Renter/Landlord Login + Register shell and standalone Admin login.
// No credentials are stored in localStorage; sessions use HttpOnly backend cookies + CSRF.
(() => {
  const EYE_OPEN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_CLOSED = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

  function wirePasswordToggles(scope) {
    scope.querySelectorAll("[data-pw-toggle]").forEach((btn) => {
      btn.innerHTML = EYE_OPEN;
      btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.pwToggle);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        btn.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
      });
    });
  }

  function sanitizeNextUrl(raw) {
    if (!raw || typeof raw !== "string") return "";
    if (/^\s*\/\//.test(raw) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return "";
    try {
      const u = new URL(raw, location.origin);
      if (u.origin !== location.origin) return "";
      return u.pathname + u.search + u.hash;
    } catch (_) {
      return "";
    }
  }

  // ---------- Unified Renter / Landlord Auth Page ----------
  const shell = document.querySelector("[data-unified-auth]");
  if (shell) {
    const params = new URLSearchParams(location.search);
    const status = document.getElementById("form-status");
    const heading = document.getElementById("auth-heading");
    const sub = document.getElementById("auth-sub");
    const loginForm = document.getElementById("auth-login-form");
    const regForm = document.getElementById("auth-register-form");
    const switchToReg = document.getElementById("switch-to-register");
    const switchToLogin = document.getElementById("switch-to-login");
    const roleBtns = [...shell.querySelectorAll("[data-role-option]")];
    const loginSubmitBtn = loginForm?.querySelector("button[type=submit]");
    const regSubmitBtn = regForm?.querySelector("button[type=submit]");

    const rawAction = params.get("action") || "";
    const safeNext = sanitizeNextUrl(params.get("next") || "");
    let mode = params.get("mode") === "register" || shell.dataset.initialMode === "register" ? "register" : "login";
    let role = params.get("role") === "landlord" ? "landlord" : "customer";

    function clearStatus() {
      if (!status) return;
      status.textContent = "";
      status.className = "notice";
      status.hidden = true;
    }

    function say(msg, cls) {
      if (!status) return;
      status.textContent = msg;
      status.className = "notice " + (cls || "");
      status.hidden = false;
    }

    function clearErrors(formEl) {
      formEl?.querySelectorAll(".err").forEach((el) => { el.textContent = ""; });
      formEl?.querySelectorAll(".field").forEach((el) => el.classList.remove("invalid"));
      formEl?.querySelectorAll("[aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
    }

    function setErr(id, msg) {
      const el = document.getElementById(id);
      const errEl = document.getElementById(id + "-err");
      if (errEl) errEl.textContent = msg;
      if (el) {
        el.closest(".field")?.classList.toggle("invalid", !!msg);
        el.setAttribute("aria-invalid", String(!!msg));
      }
    }

    function applyServerFieldErrors(prefix, fields) {
      if (!fields || typeof fields !== "object") return;
      Object.entries(fields).forEach(([k, msg]) => {
        if (msg) setErr(prefix + k, String(msg));
      });
    }

    function syncUI() {
      const isLogin = mode === "login";
      const isLandlord = role === "landlord";

      roleBtns.forEach((btn) => {
        btn.setAttribute("aria-checked", String(btn.dataset.roleOption === role));
      });

      if (loginForm) loginForm.hidden = !isLogin;
      if (regForm) regForm.hidden = isLogin;
      if (switchToReg) switchToReg.hidden = !isLogin;
      if (switchToLogin) switchToLogin.hidden = isLogin;

      if (heading) heading.textContent = isLogin ? "Welcome back." : "Create your account.";
      if (sub) {
        sub.textContent = isLogin
          ? (isLandlord
              ? "Sign in to manage your properties, booking requests, and tenant messages."
              : "Sign in to view your saved homes, bookings, and landlord messages.")
          : (isLandlord
              ? "Create a Landlord account to list and manage rental properties across Bangladesh."
              : "Create a Renter account to book homes, save favorites, and message landlords.");
      }

      if (loginSubmitBtn) loginSubmitBtn.textContent = isLandlord ? "Sign in as Landlord" : "Sign in as Renter";
      if (regSubmitBtn) regSubmitBtn.textContent = isLandlord ? "Create Landlord account" : "Create Renter account";

      document.title = (isLogin ? "Sign In" : "Create Account") + " – Barikhuji";
    }

    function setMode(nextMode, { keepStatus = false } = {}) {
      mode = nextMode === "register" ? "register" : "login";
      if (!keepStatus) clearStatus();
      clearErrors(loginForm);
      clearErrors(regForm);
      syncUI();
      if (window.history && history.replaceState) {
        const nextQs = new URLSearchParams(location.search);
        nextQs.set("mode", mode);
        nextQs.set("role", role);
        history.replaceState(null, "", location.pathname + "?" + nextQs.toString());
      }
    }

    roleBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        role = btn.dataset.roleOption === "landlord" ? "landlord" : "customer";
        clearStatus();
        syncUI();
      });
    });

    shell.querySelectorAll("[data-switch-mode]").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.switchMode));
    });

    wirePasswordToggles(shell);
    syncUI();

    if (loginForm) {
      BK_VALIDATE(loginForm, async (data) => {
        clearStatus();
        loginSubmitBtn.disabled = true;
        try {
          const res = await BK_ACCOUNT_API.auth(role, "login", data);
          if (res.notConnected) {
            say("Your details look valid, but the backend is not connected yet, so nothing was sent and no account or session was created.");
            loginSubmitBtn.disabled = false;
            return;
          }
          if (window.BK?.setCurrentUser && res.user) BK.setCurrentUser(res.user);

          if (safeNext && role === "customer") {
            const target = new URL(safeNext, location.origin);
            if (rawAction) target.searchParams.set("pendingAction", rawAction);
            location.href = target.pathname + target.search + target.hash;
            return;
          }
          if (safeNext && role === "landlord" && !/\/admin\//i.test(safeNext) && !/^\/dashboard\.html/i.test(safeNext)) {
            location.href = safeNext;
            return;
          }
          location.href = role === "landlord" ? "landlord/dashboard.html" : "dashboard.html";
        } catch (e) {
          say(e.message || "Could not sign in.", "bad");
          loginSubmitBtn.disabled = false;
        }
      });
    }

    if (regForm) {
      BK_VALIDATE(regForm, async (data) => {
        clearStatus();
        const mismatch = data.password !== data.confirmPassword;
        setErr("reg-confirmPassword", mismatch ? "Passwords do not match." : "");
        const termsChecked = !!regForm.elements.terms?.checked;
        setErr("reg-terms", termsChecked ? "" : "You must accept the Terms and Privacy Policy.");
        if (mismatch || !termsChecked) return;

        const payload = {
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          password: data.password
        };

        regSubmitBtn.disabled = true;
        try {
          const res = await BK_ACCOUNT_API.auth(role, "register", payload);
          if (res.notConnected) {
            say("Your details look valid, but the backend is not connected yet, so nothing was sent and no account or session was created.");
            regSubmitBtn.disabled = false;
            return;
          }

          const createdEmail = data.email.trim();
          const roleMsg = role === "landlord"
            ? "Landlord account created! Please sign in with your password (account verification happens with our team)."
            : "Account created successfully! Please sign in with your password to continue.";
          regForm.reset();
          regSubmitBtn.disabled = false;
          setMode("login", { keepStatus: true });
          const loginEmail = document.getElementById("login-email");
          const loginPassword = document.getElementById("login-password");
          if (loginEmail) loginEmail.value = createdEmail;
          say(roleMsg, "good");
          loginPassword?.focus();
        } catch (e) {
          applyServerFieldErrors("reg-", e.fields);
          say(e.message || "Could not create account.", "bad");
          regSubmitBtn.disabled = false;
        }
      });
    }
    return;
  }

  // ---------- Standalone Auth Form (e.g. admin/login.html) ----------
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

  BK_VALIDATE(form, async (data) => {
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
      else {
        if (window.BK?.setCurrentUser && res.user) BK.setCurrentUser(res.user);
        location.href = form.dataset.redirect;
      }
    } catch (e) { say(e.message, "bad"); }
    btn.disabled = false;
  });
})();
