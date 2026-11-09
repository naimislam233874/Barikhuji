(() => {
  const form = document.getElementById("cform"), status = document.getElementById("form-status");
  function say(msg, cls) { status.textContent = msg; status.className = "notice " + (cls || ""); status.hidden = false; }
  BK_VALIDATE(form, async data => {
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const res = await BK_ACCOUNT_API.sendContact(data);
      if (res.saved) { say("Thank you. Your message has been sent.", "good"); form.reset(); }
      else say("Your message looks valid, but the backend is not connected yet, so it was not sent.");
    } catch (e) { say(e.message, "bad"); }
    btn.disabled = false;
  });
})();