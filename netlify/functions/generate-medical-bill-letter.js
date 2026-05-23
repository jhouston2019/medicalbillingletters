/**
 * Medical bill wizard — letter generation API for authenticated/staging flows.
 * Preview funnel generates letters via medical-bill-job-save only.
 */

const { verifyWizardAccess, envTruthy } = require("./_wizardAuth");
const { getBillingSnapshot } = require("./_billingSnapshot");
const { generateMedicalBillLetterFromWizard } = require("./_generateMedicalBillLetterCore");

function corsHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { accessToken } = body;

    const auth = await verifyWizardAccess(accessToken);
    if (!auth.ok) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: auth.error }),
      };
    }

    const stagingBypass = envTruthy("WIZARD_ALLOW_BYPASS") && auth.bypass && !auth.userId;

    if (!auth.userId && !stagingBypass) {
      return {
        statusCode: 403,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error:
            "Letter generation runs after Step 5 in the upload wizard. Complete there to preview and unlock.",
        }),
      };
    }

    if (auth.userId && !auth.bypass) {
      const snap = await getBillingSnapshot(auth.userId);
      if (snap.paid !== true) {
        return {
          statusCode: 403,
          headers: corsHeaders(),
          body: JSON.stringify({
            success: false,
            error: "Payment required",
            needsPayment: true,
          }),
        };
      }
    }

    const letter = await generateMedicalBillLetterFromWizard(body);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        letter,
      }),
    };
  } catch (err) {
    console.error("generate-medical-bill-letter error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: false,
        error: err.message || "Letter generation failed",
      }),
    };
  }
};
