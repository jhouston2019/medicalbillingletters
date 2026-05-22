/**
 * After checkout, let the payer set a real password on their server-created account.
 * Verifies job is paid/unlocked and email matches the job's linked auth user.
 */

const { getSupabaseAdmin } = require("./_supabase");

function cors(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";

    if (!email || !password || !jobId) {
      return {
        statusCode: 400,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "email, password, and job_id are required" }),
      };
    }

    if (password.length < 8) {
      return {
        statusCode: 400,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Password must be at least 8 characters" }),
      };
    }

    const supabase = getSupabaseAdmin();

    const { data: job, error: jobErr } = await supabase
      .from("medical_bill_jobs")
      .select("id, user_id, paid, is_unlocked")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      return {
        statusCode: 404,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Letter not found" }),
      };
    }

    if (!(job.is_unlocked === true || job.paid === true)) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Complete payment before setting a password" }),
      };
    }

    if (!job.user_id) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "No account linked to this letter yet" }),
      };
    }

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(job.user_id);
    if (userErr || !userData?.user) {
      return {
        statusCode: 404,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Account not found" }),
      };
    }

    if (normalizeEmail(userData.user.email) !== email) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({
          success: false,
          error: "Use the same email address from Stripe checkout",
        }),
      };
    }

    const { error: updErr } = await supabase.auth.admin.updateUserById(job.user_id, {
      password,
      email_confirm: true,
    });

    if (updErr) {
      console.error("[claim-checkout-account] updateUserById", updErr);
      return {
        statusCode: 500,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Could not set password" }),
      };
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("[claim-checkout-account]", err);
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ success: false, error: err.message || "Failed" }),
    };
  }
};
