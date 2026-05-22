import { createClient } from "@supabase/supabase-js";

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

function showToast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:9999;font-size:0.95rem;max-width:min(92vw,480px);text-align:center;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function redirectToDashboardWithToast() {
  try {
    sessionStorage.setItem("dashboard_toast", "Your letter is ready — find it in Recent Letters below.");
  } catch (_) {}
  window.location.href = "/dashboard";
}

async function lookupJobId(session_id, initialJobId) {
  if (initialJobId) return initialJobId;

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("/.netlify/functions/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success === true && data.job_id) {
        return String(data.job_id).trim();
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function run() {
  const params = new URLSearchParams(window.location.search);
  const session_id = params.get("session_id");
  if (!session_id) {
    window.location.replace("/upload");
    return;
  }

  setHeroProcessing("Verifying payment…");
  showProcessingUi(true);
  showError(false);

  const verifyRes = await fetch("/.netlify/functions/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id }),
  });

  const verifyData = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok || verifyData.success !== true || verifyData.paid !== true || !verifyData.email) {
    const msg =
      [verifyData.error, verifyData.details].filter(Boolean).join(" — ") || "Verification failed.";
    showProcessingUi(false);
    showFailure(msg);
    return;
  }

  setHeroProcessing("Finalizing your letter…");

  const accRes = await fetch("/.netlify/functions/create-account-from-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, email: verifyData.email }),
  });

  const accData = await accRes.json().catch(() => ({}));

  if (!accRes.ok || accData.success !== true) {
    const msg =
      [accData.error, accData.details].filter(Boolean).join(" — ") || "Could not complete purchase.";
    showProcessingUi(false);
    showFailure(msg);
    return;
  }

  await new Promise((r) => setTimeout(r, 500));

  const jobId = await lookupJobId(session_id, verifyData.job_id);
  if (jobId) {
    window.location.href = `/preview/${encodeURIComponent(jobId)}`;
    return;
  }

  redirectToDashboardWithToast();
}

document.getElementById("success-retry")?.addEventListener("click", () => {
  window.location.reload();
});

run().catch((e) => {
  console.error(e);
  showProcessingUi(false);
  showFailure(e.message || "Something went wrong.");
});
