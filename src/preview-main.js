function jobIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("preview");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

async function startCheckoutForJob(jobId) {
  const btn = document.getElementById("preview-checkout");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Redirecting…";
  }
  try {
    const res = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "single", job_id: jobId }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    alert(data.error || data.details || "Could not start checkout.");
  } catch (e) {
    alert(e.message || "Checkout failed.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Get Your Full Appeal — $59";
    }
  }
}

async function run() {
  const jobId = jobIdFromPath();
  if (!jobId) {
    document.getElementById("preview-loading").style.display = "none";
    const err = document.getElementById("preview-error");
    err.style.display = "block";
    err.textContent = "Missing appeal reference. Start again from the upload wizard.";
    return;
  }

  const res = await fetch(`/.netlify/functions/medical-bill-job-get?job_id=${encodeURIComponent(jobId)}`);
  const data = await res.json().catch(() => ({}));

  document.getElementById("preview-loading").style.display = "none";

  if (!res.ok || !data.success) {
    const err = document.getElementById("preview-error");
    err.style.display = "block";
    err.textContent = data.error || "Could not load preview.";
    return;
  }

  if (data.unlocked === true) {
    window.location.replace(`/result/${jobId}`);
    return;
  }

  document.getElementById("preview-main").style.display = "block";
  const sumEl = document.getElementById("preview-summary");
  if (sumEl) sumEl.textContent = data.analysis_summary || "";

  const exc = document.getElementById("preview-excerpt");
  if (exc) exc.textContent = data.preview_text || "";

  if (data.hard_stop === true) {
    document.getElementById("preview-locked").style.display = "none";
    const hs = document.getElementById("preview-hardstop");
    hs.style.display = "block";
    document.getElementById("preview-hardstop-msg").textContent =
      "This case requires professional representation. We cannot complete a paid appeal letter here.";
  }

  document.getElementById("preview-checkout")?.addEventListener("click", () => startCheckoutForJob(jobId));
}

run().catch((e) => {
  console.error(e);
  document.getElementById("preview-loading").style.display = "none";
  const err = document.getElementById("preview-error");
  err.style.display = "block";
  err.textContent = e.message || "Something went wrong.";
});
