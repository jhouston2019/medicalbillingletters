import { getCurrentUser, signIn } from "./components/Auth.js";

function jobIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("result");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

async function downloadBinary(url, body, filename) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get("Content-Type") || "";
  if (!res.ok) {
    let msg = "Download failed";
    try {
      const j = await res.json();
      msg = j.error || j.details || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  if (!ct.includes("pdf") && !ct.includes("wordprocessingml") && !ct.includes("octet-stream")) {
    try {
      const j = await res.json();
      throw new Error(j.error || "Unexpected response");
    } catch (e) {
      if (e.message !== "Unexpected response") throw e;
    }
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function run() {
  const jobId = jobIdFromPath();
  if (!jobId) {
    document.getElementById("result-loading").style.display = "none";
    const err = document.getElementById("result-error");
    err.style.display = "block";
    err.textContent =
      "Missing appeal reference. If you just paid, return to the email confirmation link or start from Upload.";
    return;
  }

  const res = await fetch(`/.netlify/functions/medical-bill-job-get?job_id=${encodeURIComponent(jobId)}`);
  const data = await res.json().catch(() => ({}));

  document.getElementById("result-loading").style.display = "none";

  if (!res.ok || !data.success) {
    const err = document.getElementById("result-error");
    err.style.display = "block";
    err.textContent = data.error || "Could not load result.";
    return;
  }

  console.log("JOB AFTER PAYMENT:", data);

  if (!data.is_unlocked || !data.letter_full) {
    document.getElementById("result-main").style.display = "block";
    document.getElementById("result-locked").style.display = "block";
    const back = document.getElementById("result-back-preview");
    if (back) back.href = `/preview/${jobId}`;
    return;
  }

  document.getElementById("result-main").style.display = "block";
  document.getElementById("result-locked").style.display = "none";
  const lb = document.getElementById("letter-body");
  if (lb) lb.textContent = data.letter_full;

  document.getElementById("btn-copy")?.addEventListener("click", async () => {
    const text = document.getElementById("letter-body")?.innerText || "";
    await navigator.clipboard.writeText(text);
  });

  document.getElementById("btn-pdf")?.addEventListener("click", async () => {
    try {
      const letterText = document.getElementById("letter-body")?.innerText || "";
      await downloadBinary(
        "/.netlify/functions/generate-pdf",
        { text: letterText, fileName: "medical-dispute-letter.pdf" },
        "medical-dispute-letter.pdf"
      );
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById("btn-docx")?.addEventListener("click", async () => {
    try {
      const letterText = document.getElementById("letter-body")?.innerText || "";
      await downloadBinary(
        "/.netlify/functions/generate-docx",
        { text: letterText, fileName: "medical-dispute-letter.docx" },
        "medical-dispute-letter.docx"
      );
    } catch (e) {
      alert(e.message);
    }
  });

  await setupSaveAccountPrompt(jobId);
}

async function setupSaveAccountPrompt(jobId) {
  const prompt = document.getElementById("save-account-prompt");
  if (!prompt) return;

  const user = await getCurrentUser();
  if (user) {
    prompt.style.display = "none";
    return;
  }

  prompt.style.display = "block";

  const emailInput = document.getElementById("save-email");
  if (emailInput) {
    try {
      const checkoutEmail = sessionStorage.getItem("checkout_email");
      if (checkoutEmail && !emailInput.value) {
        emailInput.value = checkoutEmail;
      }
    } catch (_) {}
  }

  const form = document.getElementById("save-account-form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("save-email")?.value.trim();
    const password = document.getElementById("save-password")?.value || "";
    const confirm = document.getElementById("save-confirm")?.value || "";
    const msgEl = document.getElementById("save-account-msg");
    const btn = document.getElementById("save-account-btn");

    const showMsg = (text, ok) => {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.style.display = "block";
      msgEl.style.color = ok ? "#86efac" : "#fca5a5";
    };

    if (!email) {
      showMsg("Please enter your email address.", false);
      return;
    }
    if (password !== confirm) {
      showMsg("Passwords do not match.", false);
      return;
    }
    if (password.length < 8) {
      showMsg("Password must be at least 8 characters.", false);
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving…";
    }

    try {
      const claimRes = await fetch("/.netlify/functions/claim-checkout-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, job_id: jobId }),
      });
      const claimData = await claimRes.json().catch(() => ({}));
      if (!claimRes.ok || !claimData.success) {
        showMsg(claimData.error || "Could not set password.", false);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Set Password & Save";
        }
        return;
      }

      const { error: signInErr } = await signIn(email, password);
      if (signInErr) {
        showMsg(signInErr.message, false);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Set Password & Save";
        }
        return;
      }

      showMsg("Password saved. Redirecting to your dashboard...", true);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err) {
      showMsg(err.message || "Could not create account.", false);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Set Password & Save";
      }
    }
  });
}

run().catch((e) => {
  console.error(e);
  document.getElementById("result-loading").style.display = "none";
  const err = document.getElementById("result-error");
  err.style.display = "block";
  err.textContent = e.message || "Something went wrong.";
});
