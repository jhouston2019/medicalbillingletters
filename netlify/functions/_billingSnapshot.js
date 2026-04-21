/**
 * Billing reads: user_entitlements only.
 * paid === active and (no expires_at or expires_at in the future).
 */
const { getSupabaseAdmin } = require("./_supabase");

const PLAN_DEFAULTS = {
  single: { review_limit: 1 },
  monthly: { review_limit: 10 },
  premier: { review_limit: 10 },
  annual: { review_limit: -1 },
  enterprise: { review_limit: -1 },
};

function normalizePlan(plan) {
  const p = String(plan || "single").toLowerCase();
  if (p === "pro" || p === "proplus" || p === "standard" || p === "starter") return "premier";
  if (p === "complex") return "enterprise";
  if (p === "monthly") return "monthly";
  if (p === "annual") return "annual";
  if (PLAN_DEFAULTS[p]) return p;
  return "single";
}

/**
 * @param {string} userId
 */
async function getBillingSnapshot(userId) {
  if (!userId) {
    return {
      paid: false,
      grace: false,
      plan_type: null,
      usage: { used: 0, limit: 0, remaining: 0 },
      error: "no_user",
    };
  }

  const supabase = getSupabaseAdmin();

  const { data: ent, error: entErr } = await supabase
    .from("user_entitlements")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (entErr) {
    console.error("[getBillingSnapshot]", entErr);
    return {
      paid: false,
      grace: false,
      plan_type: null,
      usage: { used: 0, limit: 0, remaining: 0 },
      error: "read_failed",
    };
  }

  if (!ent) {
    return {
      paid: false,
      grace: false,
      plan_type: null,
      usage: { used: 0, limit: 0, remaining: 0 },
    };
  }

  const now = Date.now();
  const exp = ent.expires_at ? new Date(ent.expires_at).getTime() : null;
  const notExpired = exp == null || !Number.isFinite(exp) || exp > now;
  const grace = String(ent.status) === "grace";
  const paid = !grace && String(ent.status) === "active" && notExpired;
  const plan = normalizePlan(ent.plan_type);
  const baseLimit = PLAN_DEFAULTS[plan]?.review_limit ?? 1;

  const { count: sessionCount, error: scErr } = await supabase
    .from("processed_sessions")
    .select("session_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed");

  if (scErr) {
    console.error("[getBillingSnapshot] processed_sessions count", scErr);
  }

  const slots = sessionCount ?? 0;
  const unlimited = baseLimit === -1;
  const limit = unlimited
    ? null
    : baseLimit * Math.max(slots, paid ? 1 : 0);

  const { count, error: useErr } = await supabase
    .from("user_review_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (useErr) {
    console.error("[getBillingSnapshot] usage count", useErr);
  }

  const used = count ?? 0;
  const remaining = unlimited ? null : Math.max(0, (limit ?? 0) - used);

  return {
    paid,
    grace,
    plan_type: plan,
    active: paid,
    stripe_customer_id: ent.stripe_customer_id || null,
    usage: {
      used,
      limit: unlimited ? null : limit,
      remaining,
    },
  };
}

function planReviewLimitFromType(planType) {
  const p = normalizePlan(planType);
  return PLAN_DEFAULTS[p]?.review_limit ?? 1;
}

module.exports = {
  getBillingSnapshot,
  normalizePlan,
  planReviewLimitFromType,
  PLAN_DEFAULTS,
};
