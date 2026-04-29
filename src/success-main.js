import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function setHeroProcessing(msg) {
  const heroSub = document.getElementById("success-hero-sub");
  if (heroSub) heroSub.textContent = msg || "";
  const titleEl = document.getElementById("success-page-title");
  if (titleEl) titleEl.textContent = "Checking payment…";
}

function showProcessingUi(show) {
  const mainCard = document.getElementById("success-main-card");
  if (mainCard) mainCard.style.display = show ? "none" : "block";
}

function showError(show) {
  const el = document.getElementById("success-error");
  if (el) el.style.display = show ? "block" : "none";
}

function showFailure(message) {
  const ready = document.getElementById("success-ready");
  if (ready) ready.style.display = "none";
  const statusEl = document.getElementById("success-status");
  if (statusEl) statusEl.textContent = "";
  showError(true);
  const errEl = document.getElementById("success-error-msg");
  if (errEl) errEl.textContent = message;
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  if (!sessionId) {
    window.location.replace("/upload");
    return;
  }

  setHeroProcessing("Verifying payment…");
  showProcessingUi(true);
  showError(false);

  const verifyRes = await fetch("/.netlify/functions/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  const verifyData = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok || verifyData.success !== true || verifyData.paid !== true || !verifyData.email) {
    const msg =
      [verifyData.error, verifyData.details].filter(Boolean).join(" — ") || "Verification failed.";
    showProcessingUi(false);
    showFailure(msg);
    return;
  }

  setHeroProcessing("Creating your session…");

  const accRes = await fetch("/.netlify/functions/create-account-from-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: verifyData.email, sessionId }),
  });

  const accData = await accRes.json().catch(() => ({}));

  if (!accRes.ok || accData.success !== true || !accData.access_token) {
    const msg =
      [accData.error, accData.details].filter(Boolean).join(" — ") || "Could not complete signup.";
    showProcessingUi(false);
    showFailure(msg);
    return;
  }

  const { error: setErr } = await supabase.auth.setSession({
    access_token: accData.access_token,
    refresh_token: accData.refresh_token ?? "",
  });

  if (setErr) {
    showProcessingUi(false);
    showFailure([setErr.message, "Browser could not store the session."].filter(Boolean).join(" "));
    return;
  }

  const jobId = verifyData.job_id || accData.job_id;
  setHeroProcessing("Redirecting…");

  if (jobId) {
    window.location.replace(`/result/${jobId}`);
  } else {
    window.location.replace("/upload");
  }
}

document.getElementById("success-retry")?.addEventListener("click", () => {
  window.location.reload();
});

run().catch((e) => {
  console.error(e);
  showProcessingUi(false);
  showFailure(e.message || "Something went wrong.");
});
