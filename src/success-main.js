import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AUTO_REDIRECT_SEC = 12;
let autoRedirectTimerId = null;

function setStatus(msg) {
  const el = document.getElementById("success-status");
  if (el) el.textContent = msg;
}

function showError(show) {
  const el = document.getElementById("success-error");
  if (el) el.style.display = show ? "block" : "none";
}

function showFallback(show, sessionId, extraHint) {
  const box = document.getElementById("success-fallback");
  const hint = document.getElementById("success-fallback-hint");
  const uploadLink = document.getElementById("success-upload-link");
  if (!box) return;
  box.style.display = show ? "block" : "none";
  if (show && sessionId && uploadLink) {
    try {
      sessionStorage.setItem("last_checkout_session_id", sessionId);
    } catch (_) {}
    uploadLink.href = "/upload.html";
  }
  if (hint) {
    hint.textContent = show
      ? extraHint ||
        "Payment may still be processing, or auto-login hit a configuration issue. Try Retry, or log in with the same email you used at checkout."
      : "";
  }
}

function showFailure(message, sessionId) {
  stopAutoRedirect();
  const ready = document.getElementById("success-ready");
  if (ready) ready.style.display = "none";
  setStatus("");
  showError(true);
  showFallback(true, sessionId, "");
  const errEl = document.getElementById("success-error-msg");
  if (errEl) errEl.textContent = message;
}

function stopAutoRedirect() {
  if (autoRedirectTimerId != null) {
    clearInterval(autoRedirectTimerId);
    autoRedirectTimerId = null;
  }
}

function goToWizard() {
  stopAutoRedirect();
  window.location.replace("/upload.html");
}

function showReadyState() {
  const ready = document.getElementById("success-ready");
  const heroSub = document.getElementById("success-hero-sub");
  const autoEl = document.getElementById("success-autoredirect");
  setStatus("");
  if (heroSub) {
    heroSub.textContent = "You're all set. Use the button below when you're ready to start the wizard.";
  }
  if (ready) ready.style.display = "block";

  let remaining = AUTO_REDIRECT_SEC;
  const tick = () => {
    if (remaining <= 0) {
      goToWizard();
      return;
    }
    if (autoEl) {
      autoEl.textContent = `Or we'll open the wizard automatically in ${remaining} second${remaining === 1 ? "" : "s"}…`;
    }
    remaining -= 1;
  };
  tick();
  autoRedirectTimerId = setInterval(tick, 1000);
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  if (!sessionId) {
    window.location.replace("/pricing");
    return;
  }

  setStatus("Verifying payment…");
  showError(false);
  showFallback(false, sessionId, "");
  const readyEl = document.getElementById("success-ready");
  if (readyEl) readyEl.style.display = "none";
  const heroSub = document.getElementById("success-hero-sub");
  if (heroSub) {
    heroSub.textContent = "Setting up your account…";
  }

  const verifyRes = await fetch("/.netlify/functions/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  const verifyData = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok || verifyData.success !== true || verifyData.paid !== true || !verifyData.email) {
    const msg =
      [verifyData.error, verifyData.details].filter(Boolean).join(" — ") || "Verification failed.";
    showFailure(msg, sessionId);
    return;
  }

  setStatus("Creating your account…");

  const accRes = await fetch("/.netlify/functions/create-account-from-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: verifyData.email, sessionId }),
  });

  const accData = await accRes.json().catch(() => ({}));

  if (!accRes.ok || accData.success !== true || !accData.access_token) {
    const msg =
      [accData.error, accData.details].filter(Boolean).join(" — ") || "Could not complete signup.";
    showFailure(msg, sessionId);
    return;
  }

  const { error: setErr } = await supabase.auth.setSession({
    access_token: accData.access_token,
    refresh_token: accData.refresh_token ?? "",
  });

  if (setErr) {
    showFailure(
      [setErr.message, "Browser could not store the session."].filter(Boolean).join(" "),
      sessionId
    );
    return;
  }

  try {
    sessionStorage.setItem("last_checkout_session_id", sessionId);
  } catch (_) {}

  showReadyState();
}

document.getElementById("success-retry")?.addEventListener("click", () => {
  window.location.reload();
});

document.getElementById("success-continue")?.addEventListener("click", () => goToWizard());

run().catch((e) => {
  console.error(e);
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  showFailure(e.message || "Something went wrong.", sessionId || undefined);
});
