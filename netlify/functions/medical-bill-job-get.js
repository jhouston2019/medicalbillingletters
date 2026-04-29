/**
 * Load medical bill job for preview or unlocked result (never trusts client-paid flags alone).
 */

const { getSupabaseAdmin } = require("./_supabase");

function cors(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extra,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  let jobId =
    event.queryStringParameters?.job_id ||
    event.queryStringParameters?.id ||
    null;

  if (!jobId && event.httpMethod === "POST") {
    try {
      const b = JSON.parse(event.body || "{}");
      jobId = b.job_id || b.id;
    } catch (_) {}
  }

  if (!jobId || typeof jobId !== "string") {
    return {
      statusCode: 400,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "job_id required" }),
    };
  }

  jobId = jobId.trim();

  const supabase = getSupabaseAdmin();

  const { data: job, error } = await supabase
    .from("medical_bill_jobs")
    .select(
      "id, created_at, user_id, analysis_json, strategy_json, wizard_json, letter_full, preview_text, paid, is_unlocked, hard_stop"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    console.error("[medical-bill-job-get]", error);
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "Load failed" }),
    };
  }

  if (!job) {
    return {
      statusCode: 404,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "Job not found" }),
    };
  }

  const isUnlocked = job.is_unlocked === true || job.paid === true;
  const unlocked = isUnlocked;

  const rawLetter = typeof job.letter_full === "string" ? job.letter_full : "";
  const letterFirstParagraph = rawLetter.split(/\n\n+/)[0]?.trim() || "";

  const summaryForUser = job.analysis_json?.summaryForUser || "";
  const out = {
    success: true,
    job_id: job.id,
    created_at: job.created_at,
    hard_stop: job.hard_stop === true,
    analysis_summary: summaryForUser,
    regulatory_hooks: job.analysis_json?.regulatoryHooks || [],
    preview_text: job.preview_text,
    paid: job.paid === true,
    is_unlocked: isUnlocked,
    unlocked,
    locked: !unlocked,
    letter_full: unlocked ? job.letter_full : null,
    letter_preview_first: unlocked ? null : letterFirstParagraph,
  };

  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify(out),
  };
};
