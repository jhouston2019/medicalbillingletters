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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser(session?.access_token);

  if (!session?.access_token) {
    const redirect = encodeURIComponent(`${window.location.pathname}?session_id=${encodeURIComponent(sessionId)}`);
    window.location.replace(`/login.html?redirect=${redirect}`);
    return;
  }

  if (!user) {
    const redirect = encodeURIComponent(`${window.location.pathname}?session_id=${encodeURIComponent(sessionId)}`);
    window.location.replace(`/login.html?redirect=${redirect}`);
    return;
  }

  setStatus("Verifying payment…");
  showError(false);

  const res = await fetch("/.netlify/functions/verify-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId }),
  });

  const data = await res.json().catch(() => ({}));

  if (res.ok && data.success === true && data.paid === true) {
    try {
      sessionStorage.setItem("last_checkout_session_id", sessionId);
    } catch (_) {}
    window.location.replace("/app");
    return;
  }

  setStatus("");
  showError(true);
  const errEl = document.getElementById("success-error-msg");
  if (errEl) {
    errEl.textContent = data.error || "Verification failed.";
  }
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
