import { getUserMedicalBillJobs } from "./components/UploadForm.js";
import { getCurrentUser } from "./components/Auth.js";
import "./nav-auth.js";

function showToast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:9999;font-size:0.95rem;max-width:min(92vw,480px);text-align:center;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

function riskLevelColor(level) {
  const l = String(level || "").toLowerCase();
  if (l === "low") return "#22c55e";
  if (l === "medium") return "#fbbf24";
  if (l === "high") return "#ef4444";
  return "#94a3b8";
}

function formatRiskLevel(level) {
  const l = String(level || "").toLowerCase();
  if (l === "low") return "Low";
  if (l === "medium") return "Medium";
  if (l === "high") return "High";
  return "—";
}

function analysisFromJob(row) {
  if (row.analysis_json && typeof row.analysis_json === "object") return row.analysis_json;
  if (row.wizard_json?.analysis && typeof row.wizard_json.analysis === "object")
    return row.wizard_json.analysis;
  return null;
}

function strategyFromJob(row) {
  if (row.strategy_json && typeof row.strategy_json === "object") return row.strategy_json;
  if (row.wizard_json?.strategy && typeof row.wizard_json.strategy === "object")
    return row.wizard_json.strategy;
  return null;
}

function summarySnippet(row) {
  const analysis = analysisFromJob(row);
  const raw = analysis?.summaryForUser || "—";
  if (typeof raw !== "string") return "—";
  const t = raw.trim();
  if (!t) return "—";
  return t.length > 200 ? t.slice(0, 200) + "..." : t;
}

function truncateProvider(name) {
  const t = String(name || "").trim();
  if (!t) return "Medical provider";
  return t.length > 40 ? t.slice(0, 40) + "…" : t;
}

function providerFromJob(row) {
  const wizard = row.wizard_json;
  if (wizard && typeof wizard === "object" && wizard.providerName) {
    return truncateProvider(wizard.providerName);
  }
  const letter = row.letter_full || "";
  const reMatch = letter.match(/^Re:\s*(.+)$/im);
  if (reMatch && reMatch[1].trim()) {
    return truncateProvider(reMatch[1]);
  }
  const firstLine = letter
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (firstLine && firstLine.length > 3) {
    return truncateProvider(firstLine);
  }
  return "Medical provider";
}

function displayRecentAppeals(appeals) {
  const container = document.getElementById("recentLetters");

  if (!appeals || appeals.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <div style="font-size:3rem; margin-bottom:1rem;" aria-hidden="true">📄</div>
        <p style="color:#94a3b8; margin-bottom:1.5rem;">No dispute letters yet.</p>
        <a href="/upload.html" style="background:#22c55e; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Dispute Your First Bill</a>
      </div>`;
    return;
  }

  container.replaceChildren();
  appeals.forEach((rowData) => {
    const row = document.createElement("div");
    row.style.cssText =
      "border:1px solid #334155; padding:1rem 1.25rem; margin:0.5rem 0; border-radius:8px; background:#0f172a;";

    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.minWidth = "0";

    const dateStr = rowData.created_at
      ? new Date(rowData.created_at).toLocaleDateString()
      : "—";
    const provider = providerFromJob(rowData);
    const analysis = analysisFromJob(rowData);
    const strategy = strategyFromJob(rowData);
    const riskLevel = analysis?.riskLevel;
    const strategyName = strategy?.name;

    const title = document.createElement("div");
    title.style.cssText = "color:#ffffff; font-weight:600; margin-bottom:0.35rem;";
    title.textContent = dateStr + " — " + provider;

    const meta = document.createElement("div");
    meta.style.cssText = "color:#94a3b8; font-size:0.9rem; margin-bottom:0.35rem;";
    const riskSpan = document.createElement("span");
    riskSpan.textContent = "Risk level: ";
    const riskVal = document.createElement("span");
    riskVal.textContent = formatRiskLevel(riskLevel);
    riskVal.style.color = riskLevelColor(riskLevel);
    riskVal.style.fontWeight = "600";
    meta.appendChild(riskSpan);
    meta.appendChild(riskVal);
    meta.appendChild(document.createTextNode(" · Strategy: " + (strategyName || "—")));

    const summary = document.createElement("div");
    summary.style.cssText =
      "color:#cbd5e1; font-size:0.9rem; margin-bottom:0.5rem; line-height:1.5;";
    summary.textContent = summarySnippet(rowData);

    const link = document.createElement("a");
    link.href = "/preview/" + encodeURIComponent(rowData.id);
    link.textContent = "View Letter →";
    link.style.cssText = "color:#22c55e; font-weight:600; text-decoration:none;";

    content.appendChild(title);
    content.appendChild(meta);
    content.appendChild(summary);
    content.appendChild(link);
    row.appendChild(content);
    container.appendChild(row);
  });
}

async function loadUserData(user) {
  const appeals = await getUserMedicalBillJobs(user.id);
  document.getElementById("account-letters-count").textContent = String(appeals.length);
  displayRecentAppeals(appeals);
}

function showLettersError(message) {
  document.getElementById("recentLetters").innerHTML =
    `<p style="color:#94a3b8;">${message}</p>`;
}

async function bootDashboard() {
  try {
    const toast = sessionStorage.getItem("dashboard_toast");
    if (toast) {
      sessionStorage.removeItem("dashboard_toast");
      showToast(toast);
    }
  } catch (_) {}

  try {
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = "/login?redirect=" + encodeURIComponent("/dashboard");
      return;
    }

    document.getElementById("account-email").textContent = user.email || "—";
    document.getElementById("account-member-since").textContent = user.created_at
      ? new Date(user.created_at).toLocaleDateString()
      : "—";

    await loadUserData(user);
  } catch (error) {
    console.error("Failed to load dashboard:", error);
    showLettersError("Failed to load letters. Please refresh or log in again.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootDashboard();
});
