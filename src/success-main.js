import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function setStatus(msg) {
  const el = document.getElementById("success-status");
  if (el) el.textContent = msg;
}

function showError(show) {
  const el = document.getElementById("success-error");
  if (el) el.style.display = show ? "block" : "none";
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

  const verifyRes = await fetch("/.netlify/functions/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  const verifyData = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok || verifyData.success !== true || verifyData.paid !== true || !verifyData.email) {
    setStatus("");
    showError(true);
    const errEl = document.getElementById("success-error-msg");
    if (errEl) {
      errEl.textContent = verifyData.error || "Verification failed.";
    }
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
    setStatus("");
    showError(true);
    const errEl = document.getElementById("success-error-msg");
    if (errEl) {
      errEl.textContent = accData.error || "Could not complete signup.";
    }
    return;
  }

  const { error: setErr } = await supabase.auth.setSession({
    access_token: accData.access_token,
    refresh_token: accData.refresh_token,
  });

  if (setErr) {
    setStatus("");
    showError(true);
    const errEl = document.getElementById("success-error-msg");
    if (errEl) errEl.textContent = setErr.message || "Could not save session.";
    return;
  }

  try {
    sessionStorage.setItem("last_checkout_session_id", sessionId);
  } catch (_) {}

  window.location.replace("/upload.html");
}

document.getElementById("success-retry")?.addEventListener("click", () => {
  window.location.reload();
});

run().catch((e) => {
  console.error(e);
  setStatus("");
  showError(true);
  const errEl = document.getElementById("success-error-msg");
  if (errEl) errEl.textContent = e.message || "Something went wrong.";
});
