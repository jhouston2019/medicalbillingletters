// Main application entry point
import "./nav-auth.js";
import { getCurrentUser, getSession } from "./components/Auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const pricingBtn = document.getElementById("pricing-checkout");
  if (pricingBtn) {
    pricingBtn.addEventListener("click", (e) => window.startCheckout("single", e));
  }
});

// Global checkout — optional job_id for preview funnel (Stripe metadata).
window.startCheckout = async function (plan, ev, jobId) {
  const clickEv = ev || (typeof globalThis !== "undefined" && globalThis.event) || null;
  const button = clickEv?.target;
  let originalText = "";
  try {
    const user = await getCurrentUser();
    const body = { plan: plan || "single" };
    if (user?.email) {
      body.customer_email = user.email;
    }
    if (jobId) {
      body.job_id = jobId;
    }

    if (button) {
      originalText = button.textContent;
      button.textContent = "Processing...";
      button.disabled = true;
    }

    const headers = { "Content-Type": "application/json" };
    const session = await getSession();
    if (session?.access_token) {
      headers.Authorization = "Bearer " + session.access_token;
    }

    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Failed to create checkout session: " + (data.error || "Unknown error"));
      if (button) {
        button.textContent = originalText;
        button.disabled = false;
      }
    }
  } catch (error) {
    alert("Failed to start checkout: " + error.message);
    if (button) {
      button.textContent = button.getAttribute("data-original-text") || "Try Again";
      button.disabled = false;
    }
  }
};
