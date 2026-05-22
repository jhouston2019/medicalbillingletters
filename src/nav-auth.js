import { createClient } from "@supabase/supabase-js";
import { signOut } from "./components/Auth.js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

async function updateNav() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
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

export function initNavAuth() {
  updateNav();
  supabase.auth.onAuthStateChange(() => updateNav());
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
