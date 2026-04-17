/**
 * Server-side wizard auth. When WIZARD_ALLOW_BYPASS is true, accepts accessToken === 'bypass' for staging.
 */
const { createClient } = require("@supabase/supabase-js");

function envTruthy(name) {
  const v = String(process.env[name] || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

async function verifyWizardAccess(accessToken) {
  const bypass = envTruthy("WIZARD_ALLOW_BYPASS");
  if (bypass && (!accessToken || accessToken === "bypass")) {
    return { ok: true, bypass: true, userId: null, email: null };
  }

  if (!accessToken || accessToken === "bypass") {
    return { ok: false, error: "Authentication required" };
  }

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, error: "Server configuration error" };
  }

  const supabase = createClient(url, anon);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { ok: false, error: "Invalid or expired session" };
  }

  return { ok: true, bypass: false, userId: user.id, email: user.email };
}

module.exports = { verifyWizardAccess, envTruthy };
