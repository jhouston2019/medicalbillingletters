/**
 * Payment enforcement using user_entitlements only (via getBillingSnapshot).
 */

const { getSupabaseAdmin } = require("./_supabase");
const { getBillingSnapshot } = require("./_billingSnapshot");

function isPaymentBypassEnabled() {
  const a = (process.env.ALLOW_PAYMENT_BYPASS || "").toLowerCase();
  const b = (process.env.BYPASS_PAYMENT_WALL || "").toLowerCase();
  const on = (v) => v === "true" || v === "1" || v === "yes";
  return on(a) || on(b);
}

async function verifyPayment(userId, _email) {
  if (isPaymentBypassEnabled()) {
    console.warn("[ALLOW_PAYMENT_BYPASS] verifyPayment skipped — dev only");
    return {
      verified: true,
      bypass: true,
      paymentRecord: null,
      documentId: null,
      canGenerate: true,
    };
  }

  if (!userId) {
    return {
      verified: false,
      error: "No user identifier provided",
    };
  }

  const snap = await getBillingSnapshot(userId);
  if (snap.paid === true) {
    return {
      verified: true,
      paymentRecord: snap,
      documentId: null,
      canGenerate: true,
    };
  }

  return {
    verified: false,
    error: "Payment required",
    needsPayment: true,
  };
}

async function markPaymentUsed(documentId) {
  if (isPaymentBypassEnabled()) {
    return true;
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("claim_letters")
    .update({
      letter_generated: true,
      letter_generated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (error) {
    console.error("Failed to mark payment as used:", error);
    return false;
  }

  return true;
}

async function canUpload(userId, email) {
  const verification = await verifyPayment(userId, email);

  if (!verification.verified) {
    return {
      allowed: false,
      reason: verification.error,
      needsPayment: verification.needsPayment,
    };
  }

  return {
    allowed: true,
    documentId: verification.documentId,
  };
}

async function canGenerateLetter(userId, documentId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("claim_letters")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return {
      allowed: false,
      reason: "Document not found or access denied",
    };
  }

  if (isPaymentBypassEnabled()) {
    return {
      allowed: true,
      document: data,
      bypass: true,
    };
  }

  const snap = await getBillingSnapshot(userId);
  if (!snap.paid) {
    return {
      allowed: false,
      reason: "Payment required",
      needsPayment: true,
    };
  }

  if (data.payment_status !== "paid" && data.stripe_payment_status !== "paid") {
    return {
      allowed: false,
      reason: "Payment required",
      needsPayment: true,
    };
  }

  if (data.letter_generated) {
    return {
      allowed: false,
      reason: "Letter already generated for this payment. Please purchase again for a new letter.",
      needsPayment: true,
    };
  }

  return {
    allowed: true,
    document: data,
  };
}

async function withPaymentEnforcement(event, handler) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, email } = body;

    if (!userId && !email) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Authentication required",
          message: "Please login to continue",
        }),
      };
    }

    const verification = await verifyPayment(userId, email);

    if (!verification.verified) {
      return {
        statusCode: 403,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Payment required",
          message: verification.error,
          needsPayment: verification.needsPayment,
          redirectTo: "/pricing",
        }),
      };
    }

    return await handler(event, verification);
  } catch (error) {
    console.error("Payment enforcement error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Payment verification failed",
        message: error.message,
      }),
    };
  }
}

module.exports = {
  verifyPayment,
  markPaymentUsed,
  canUpload,
  canGenerateLetter,
  withPaymentEnforcement,
  isPaymentBypassEnabled,
};
