/**
 * Save wizard payload + generated appeal letter as a job record (guest or verified paid user).
 */

const { optionalAuth } = require("./_middleware/auth");
const { getSupabaseAdmin } = require("./_supabase");
const { getBillingSnapshot } = require("./_billingSnapshot");
const {
  generateMedicalBillLetterFromWizard,
  previewFromLetter,
} = require("./_generateMedicalBillLetterCore");

function cors(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

/** Paid users consume usage at analyze (step 3). Unlock letter when entitlement active + review usage exists for this checkout session. */
async function paidUserQualifiesForUnlockedLetter(supabase, userId, usageSessionIdFromBody) {
  const snap = await getBillingSnapshot(userId);
  if (snap.paid !== true) return false;
  const sid =
    usageSessionIdFromBody && typeof usageSessionIdFromBody === "string"
      ? usageSessionIdFromBody.trim()
      : null;
  if (!sid) return false;

  const { data: row } = await supabase
    .from("user_review_usage")
    .select("analysis_json")
    .eq("user_id", userId)
    .eq("session_id", sid)
    .maybeSingle();

  return !!(row && row.analysis_json != null);
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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "Invalid JSON" }),
    };
  }

  const user = await optionalAuth(event);
  const {
    analysis,
    strategy,
    patientName,
    accountNumber,
    dateOfService,
    providerName,
    disputedAmount,
    specificCharges,
    resolutionAsk,
    billDate,
    networkStatus,
    serviceType,
    hasEOB,
    priorContact,
    letterDate,
    usageSessionId,
  } = body;

  if (!analysis || !strategy) {
    return {
      statusCode: 400,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "analysis and strategy required" }),
    };
  }

  const hardStop = analysis.hardStop === true;

  const wizardPayload = {
    patientName,
    accountNumber,
    dateOfService,
    providerName,
    disputedAmount,
    specificCharges,
    resolutionAsk,
    billDate,
    networkStatus,
    serviceType,
    hasEOB,
    priorContact,
    letterDate: letterDate || null,
  };

  const supabase = getSupabaseAdmin();

  let letterFull = "";
  let previewText = "";
  let paid = false;

  if (hardStop) {
    previewText = String(analysis.summaryForUser || analysis.hardStopReason || "").slice(0, 3000);
    letterFull = "";
  } else {
    try {
      letterFull = await generateMedicalBillLetterFromWizard({
        analysis,
        strategy,
        patientName,
        accountNumber,
        dateOfService,
        providerName,
        disputedAmount,
        specificCharges,
        resolutionAsk,
        billDate,
        networkStatus,
        serviceType,
        hasEOB,
        priorContact,
        letterDate: letterDate || null,
      });
      previewText = previewFromLetter(letterFull, analysis);
    } catch (e) {
      console.error("[medical-bill-job-save] letter gen", e);
      return {
        statusCode: 500,
        headers: cors(),
        body: JSON.stringify({
          success: false,
          error: e.message || "Could not generate appeal preview",
        }),
      };
    }
  }

  let skipPayment = false;

  if (user?.id && !hardStop && letterFull) {
    const qualifies = await paidUserQualifiesForUnlockedLetter(supabase, user.id, usageSessionId);
    if (qualifies) {
      paid = true;
      skipPayment = true;
    }
  }

  const row = {
    user_id: user?.id || null,
    analysis_json: analysis,
    strategy_json: strategy,
    wizard_json: wizardPayload,
    letter_full: letterFull,
    preview_text: previewText || "Preview unavailable.",
    paid,
    is_unlocked: paid,
    hard_stop: hardStop,
  };

  const { data: inserted, error: insErr } = await supabase.from("medical_bill_jobs").insert(row).select("id").single();

  if (insErr) {
    console.error("[medical-bill-job-save] insert", insErr);
    return {
      statusCode: 503,
      headers: cors(),
      body: JSON.stringify({
        success: false,
        error:
          insErr.code === "42P01"
            ? "Database table missing — apply sql/medical_bill_jobs.sql in Supabase."
            : insErr.message || "Could not save job",
      }),
    };
  }

  const jobId = inserted?.id;

  return {
    statusCode: 200,
    headers: cors(),
    body: JSON.stringify({
      success: true,
      job_id: jobId,
      skip_payment: skipPayment,
      preview_text: previewText,
      redirect_url: skipPayment && jobId ? `/result/${jobId}` : `/preview/${jobId}`,
    }),
  };
};
