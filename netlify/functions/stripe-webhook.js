/**
 * Revocation / risk signals only. Never grants. Grace by default; hard revoke on full refund or dispute lost.
 */

const Stripe = require("stripe");
const { getSupabaseAdmin } = require("./_supabase");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function stripeCustomerIdFromObject(obj) {
  if (!obj) return null;
  if (typeof obj.customer === "string" && obj.customer.startsWith("cus_")) return obj.customer;
  if (obj.customer && typeof obj.customer === "object" && obj.customer.id) return obj.customer.id;
  return null;
}

async function resolveCustomerForDispute(dispute) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return stripeCustomerIdFromObject(charge);
  } catch (e) {
    console.error("[stripe-webhook] charge retrieve", e.message);
    return null;
  }
}

async function logPaymentEvent(supabase, row) {
  const { error } = await supabase.from("payment_events").insert(row);
  if (error?.code === "23505") return { duplicate: true };
  if (error) console.error("[stripe-webhook] payment_events", error.message);
  return { duplicate: false };
}

async function applyGrace(supabase, stripeCustomerId, evt, entRow) {
  const nowIso = new Date().toISOString();
  await supabase
    .from("user_entitlements")
    .update({
      status: "grace",
      expires_at: nowIso,
      updated_at: nowIso,
    })
    .eq("stripe_customer_id", stripeCustomerId)
    .in("status", ["active", "grace"]);

  await logPaymentEvent(supabase, {
    user_id: entRow?.user_id ?? null,
    session_id: null,
    event_type: "entitlement_grace",
    stripe_event_id: evt.id,
    payload: { stripe_type: evt.type, stripe_customer_id: stripeCustomerId },
  });
}

async function applyHardRevoke(supabase, stripeCustomerId, evt, entRow, extraPayload = {}) {
  const nowIso = new Date().toISOString();
  await supabase
    .from("user_entitlements")
    .update({
      status: "inactive",
      expires_at: nowIso,
      updated_at: nowIso,
    })
    .eq("stripe_customer_id", stripeCustomerId);

  const res = await logPaymentEvent(supabase, {
    user_id: entRow?.user_id ?? null,
    session_id: null,
    event_type: "entitlement_revoked",
    stripe_event_id: evt.id,
    payload: { stripe_type: evt.type, stripe_customer_id: stripeCustomerId, ...extraPayload },
  });
  return res;
}

exports.handler = async (event) => {
  try {
    const sig = event.headers["stripe-signature"];
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body || "");

    let evt;
    try {
      evt = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    const supabase = getSupabaseAdmin();

    const { data: seen } = await supabase
      .from("payment_events")
      .select("id")
      .eq("stripe_event_id", evt.id)
      .maybeSingle();
    if (seen?.id) {
      return { statusCode: 200, body: "ok" };
    }

    const handled = new Set([
      "charge.refunded",
      "charge.dispute.created",
      "charge.dispute.closed",
      "payment_intent.payment_failed",
    ]);

    if (!handled.has(evt.type)) {
      console.log("[stripe-webhook] ignored", { type: evt.type, id: evt.id });
      return { statusCode: 200, body: "ok" };
    }

    let stripeCustomerId = null;
    if (evt.type === "charge.refunded") {
      stripeCustomerId = await stripeCustomerIdFromObject(evt.data.object);
    } else if (evt.type === "charge.dispute.created" || evt.type === "charge.dispute.closed") {
      stripeCustomerId = await resolveCustomerForDispute(evt.data.object);
    } else if (evt.type === "payment_intent.payment_failed") {
      stripeCustomerId = await stripeCustomerIdFromObject(evt.data.object);
    }

    if (!stripeCustomerId) {
      console.warn("[stripe-webhook] no customer", { type: evt.type, id: evt.id });
      await logPaymentEvent(supabase, {
        user_id: null,
        session_id: null,
        event_type: "entitlement_grace",
        stripe_event_id: evt.id,
        payload: { stripe_type: evt.type, note: "no_stripe_customer" },
      });
      return { statusCode: 200, body: "ok" };
    }

    const { data: entRow } = await supabase
      .from("user_entitlements")
      .select("user_id, status")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (evt.type === "charge.dispute.created" || evt.type === "payment_intent.payment_failed") {
      await applyGrace(supabase, stripeCustomerId, evt, entRow);
      console.log("[stripe-webhook] entitlement_grace", { type: evt.type, stripeCustomerId });
      return { statusCode: 200, body: "ok" };
    }

    if (evt.type === "charge.dispute.closed") {
      const dispute = evt.data.object;
      const lost = String(dispute.status || "").toLowerCase() === "lost";
      if (lost) {
        const r = await applyHardRevoke(supabase, stripeCustomerId, evt, entRow, { dispute_status: dispute.status });
        if (r?.duplicate) return { statusCode: 200, body: "ok" };
        console.log("[stripe-webhook] entitlement_revoked dispute lost", { stripeCustomerId });
      }
      return { statusCode: 200, body: "ok" };
    }

    if (evt.type === "charge.refunded") {
      const charge = evt.data.object;
      const amount = Number(charge.amount) || 0;
      const refunded = Number(charge.amount_refunded) || 0;
      const fullyRefunded = charge.refunded === true || (amount > 0 && refunded >= amount);

      if (fullyRefunded) {
        const r = await applyHardRevoke(supabase, stripeCustomerId, evt, entRow, {
          amount,
          amount_refunded: refunded,
        });
        if (r?.duplicate) return { statusCode: 200, body: "ok" };
        console.log("[stripe-webhook] entitlement_revoked full refund", { stripeCustomerId });
      } else {
        await applyGrace(supabase, stripeCustomerId, evt, entRow);
        console.log("[stripe-webhook] entitlement_grace partial refund", { stripeCustomerId });
      }
      return { statusCode: 200, body: "ok" };
    }

    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error("[stripe-webhook]", e);
    return { statusCode: 500, body: e.message };
  }
};
