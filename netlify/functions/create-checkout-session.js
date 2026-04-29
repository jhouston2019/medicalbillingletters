const Stripe = require("stripe");
const { optionalAuth } = require("./_middleware/auth");
const { checkRateLimitDistributed, DEFAULT_MAX, WINDOW_SEC } = require("./_rateLimitRedis");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const RATE_ACTION = "create-checkout-session";

function normalizePlanParam(plan) {
  const p = String(plan || "single").toLowerCase();
  if (p === "pro" || p === "standard" || p === "starter") return "premier";
  if (p === "complex" || p === "proplus") return "enterprise";
  if (p === "monthly" || p === "annual") return p;
  if (p === "premier" || p === "enterprise" || p === "single") return p;
  return "single";
}

function priceIdForPlan(plan) {
  const p = normalizePlanParam(plan);
  const map = {
    single: process.env.STRIPE_PRICE_SINGLE || process.env.STRIPE_PRICE_RESPONSE,
    monthly: process.env.STRIPE_PRICE_MONTHLY || process.env.STRIPE_PRICE_PREMIER || process.env.STRIPE_PRICE_RESPONSE,
    premier: process.env.STRIPE_PRICE_PREMIER || process.env.STRIPE_PRICE_RESPONSE,
    annual: process.env.STRIPE_PRICE_ANNUAL || process.env.STRIPE_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_RESPONSE,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE || process.env.STRIPE_PRICE_RESPONSE,
  };
  return map[p] || process.env.STRIPE_PRICE_RESPONSE || "price_19USD_single";
}

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const user = await optionalAuth(event);

  if (user) {
    const rl = await checkRateLimitDistributed(user.id, RATE_ACTION, DEFAULT_MAX, WINDOW_SEC);
    if (!rl.ok) {
      return {
        statusCode: 429,
        headers: {
          ...cors(),
          "Retry-After": String(rl.retryAfterSec ?? 60),
        },
        body: JSON.stringify({ error: "Too many requests", retryAfterSec: rl.retryAfterSec }),
      };
    }
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const plan = normalizePlanParam(body.plan || body.plan_type || "single");
    const priceId = priceIdForPlan(plan);

    if (!process.env.SITE_URL) {
      throw new Error("SITE_URL environment variable is not set");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }

    const site = process.env.SITE_URL.replace(/\/$/, "");

    const emailFromBody = body.customer_email || body.email;
    const trimmedEmail =
      emailFromBody && typeof emailFromBody === "string" && String(emailFromBody).trim()
        ? String(emailFromBody).trim()
        : null;

    const sessionPayload = {
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      customer_creation: "always",
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/pricing`,
      metadata: {
        plan_type: plan,
      },
    };

    if (trimmedEmail) {
      sessionPayload.customer_email = trimmedEmail;
    }

    if (user?.id) {
      sessionPayload.metadata.user_id = user.id;
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({
        error: "Failed to create checkout session",
        details: error.message,
      }),
    };
  }
};
