import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function setStatus(msg) {
  const el = document.getElementById("app-router-status");
  if (el) el.textContent = msg;
}

async function run() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.replace(`/login.html?redirect=${next}`);
    return;
  }

  const bsRes = await fetch("/.netlify/functions/billing-status", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const bs = await bsRes.json();

  if (bs.paid !== true) {
    window.location.replace("/pricing");
    return;
  }

  const plan = (bs.plan_type || "single").toLowerCase();
  if (plan === "single") {
    window.location.replace("/upload.html");
  } else {
    window.location.replace("/dashboard.html");
  }
}

run().catch((e) => {
  console.error(e);
  setStatus("Routing failed. Open Dashboard or Upload from the menu.");
});
