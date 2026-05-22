import { supabase } from "./lib/supabaseClient.js";
import { signOut } from "./components/Auth.js";

function updateNavFromSession(session) {
  const user = session?.user;
  const loginLink = document.getElementById("nav-login");
  const logoutLink = document.getElementById("nav-logout");
  const welcomeEl = document.getElementById("nav-welcome");

  if (user) {
    if (loginLink) loginLink.style.display = "none";
    if (logoutLink) logoutLink.style.display = "inline";
    if (welcomeEl) welcomeEl.textContent = "Welcome, " + user.email;
  } else {
    if (loginLink) loginLink.style.display = "inline";
    if (logoutLink) logoutLink.style.display = "none";
    if (welcomeEl) welcomeEl.textContent = "";
  }
}

function bindLogout() {
  const logoutLink = document.getElementById("nav-logout");
  if (!logoutLink || logoutLink.dataset.bound === "1") return;
  logoutLink.dataset.bound = "1";
  logoutLink.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut();
    window.location.href = "/";
  });
}

async function updateNav() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  updateNavFromSession(session);
}

export function initNavAuth() {
  updateNav();
  supabase.auth.onAuthStateChange((_event, session) => updateNavFromSession(session));
  bindLogout();
}

document.addEventListener("DOMContentLoaded", () => {
  if (
    document.getElementById("nav-login") ||
    document.getElementById("nav-logout") ||
    document.getElementById("nav-welcome")
  ) {
    initNavAuth();
  }
});
