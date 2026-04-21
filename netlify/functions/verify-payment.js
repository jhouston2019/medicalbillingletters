/**
 * ONLY entitlement writer. JWT + session_id hint; Stripe session + DB RPC are authoritative.
 * Race-safe: session_verify_fast_path + finalize_verified_checkout (advisory lock + FOR UPDATE).
 */

const Stripe = require("stripe");
const { getSupabaseAdmin } = require("./_supabase");
const { requireAuth } = require("./_middleware/auth");
const { normalizePlan } = require("./_billingSnapshot");
const { expiresAtForPlan } = require("./_planExpiry");
const { checkRateLimitDistributed, DEFAULT_MAX, WINDOW_SEC } = require("./_rateLimitRedis");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const RATE_ACTION = "verify-payment";

function cors(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

/** Plan type derived only from Stripe Checkout Session fields (metadata / line items). */
function planFromStripeSession(session) {
  const fromMeta = session.metadata?.plan_type;
  if (fromMeta != null && String(fromMeta).trim() !== "") {
    return normalizePlan(fromMeta);
  }
  const lines = session.line_items?.data;
  const price = lines && lines[0] ? lines[0].price : null;
  if (price?.metadata?.plan_type) {
    return normalizePlan(price.metadata.plan_type);
  }
  if (price?.nickname) {
    return normalizePlan(price.nickname);
  }
  if (price?.recurring?.interval) {
    const iv = String(price.recurring.interval).toLowerCase();
    if (iv === "year") return normalizePlan("annual");
    if (iv === "month") return normalizePlan("monthly");
  }
  return normalizePlan("single");
}

function stripePeriodEndIso(session) {
  const sub = session.subscription;
  const obj = sub && typeof sub === "object" ? sub : null;
  if (!obj?.current_period_end) return null;
  const sec = Number(obj.current_period_end);
  if (!Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
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

  const { user, error: authErr } = await requireAuth(event);
  if (authErr || !user) {
    return {
      statusCode: 401,
      headers: cors(),
      body: JSON.stringify({ success: false, error: "Unauthorized" }),
    };
  }

  const rl = await checkRateLimitDistributed(user.id, RATE_ACTION, DEFAULT_MAX, WINDOW_SEC);
  if (!rl.ok) {
    return {
      statusCode: 429,
      headers: cors({ "Retry-After": String(rl.retryAfterSec ?? 60) }),
      body: JSON.stringify({ success: false, error: "Too many requests", retryAfterSec: rl.retryAfterSec }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const sessionIdRaw = body.sessionId || body.session_id;
    if (!sessionIdRaw || typeof sessionIdRaw !== "string") {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "session_id required" }),
      };
    }
    const sessionId = sessionIdRaw.trim();

    const supabase = getSupabaseAdmin();

    const { data: fastDone, error: fastErr } = await supabase.rpc("session_verify_fast_path", {
      p_session_id: sessionId,
      p_user_id: user.id,
    });

    if (fastErr) {
      console.error("[verify-payment] session_verify_fast_path", fastErr);
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Verification failed" }),
      };
    }

    if (fastDone === true) {
      console.log("VERIFY_PAYMENT fast completed (no Stripe)", { sessionId, userId: user.id });
      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({ success: true, paid: true }),
      };
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer", "subscription", "line_items.data.price"],
      });
    } catch (e) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Invalid Stripe session" }),
      };
    }

    if (session.payment_status !== "paid") {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Payment not completed" }),
      };
    }

    const metaUserId = session.metadata?.user_id;
    if (!metaUserId || String(metaUserId) !== String(user.id)) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Session user mismatch" }),
      };
    }

    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;

    if (!stripeCustomerId) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Missing Stripe customer" }),
      };
    }

    const planType = planFromStripeSession(session);
    const periodEndIso = stripePeriodEndIso(session);
    const expiresAt = periodEndIso || expiresAtForPlan(planType);
    const stripePeriodEnd = periodEndIso;

    const amountTotal = session.amount_total != null ? session.amount_total : null;
    const currency = session.currency != null ? String(session.currency) : null;

    const { data: fin, error: finErr } = await supabase.rpc("finalize_verified_checkout", {
      p_session_id: sessionId,
      p_user_id: user.id,
      p_stripe_customer_id: stripeCustomerId,
      p_plan_type: planType,
      p_expires_at: expiresAt,
      p_stripe_period_end: stripePeriodEnd,
    });

    if (finErr) {
      console.error("[verify-payment] finalize_verified_checkout", finErr);
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Could not finalize entitlement" }),
      };
    }

    if (fin?.error === "processing_conflict") {
      return {
        statusCode: 409,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Verification already in progress", retry: true }),
      };
    }

    if (fin?.error === "wrong_user") {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Session does not belong to this user" }),
      };
    }

    if (!fin?.ok) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Could not finalize entitlement" }),
      };
    }

    if (fin?.already !== true) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: priorVerified } = await supabase
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("event_type", "payment_verified")
        .gte("created_at", tenMinAgo);

      const riskFlag = (priorVerified ?? 0) >= 2;
      const riskReason = riskFlag ? "rapid_checkout_pattern" : null;

      const { error: logErr } = await supabase.from("payment_events").insert({
        user_id: user.id,
        session_id: sessionId,
        event_type: "payment_verified",
        stripe_event_id: null,
        risk_flag: riskFlag,
        risk_reason: riskReason,
        payload: {
          plan_type: planType,
          stripe_customer_id: stripeCustomerId,
          amount_total: amountTotal,
          currency,
          expires_at: expiresAt,
          stripe_period_end: stripePeriodEnd,
        },
      });
      if (logErr) {
        console.error("[verify-payment] payment_events insert", logErr);
      }
    }

    console.log("VERIFY_PAYMENT finalized", { sessionId, userId: user.id, planType, already: fin?.already });

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ success: true, paid: true }),
    };
  } catch (error) {
    console.error("verify-payment", error);
    return {
      statusCode: 403,
      headers: cors(),
      body: JSON.stringify({ success: false, error: error.message || "Verification failed" }),
    };
  }
};
