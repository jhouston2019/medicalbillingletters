/**
 * No entitlement writes. Ensures paid Stripe sessions have a processed_sessions row (pending) for verify-payment to complete.
 */

const Stripe = require("stripe");
const { getSupabaseAdmin } = require("./_supabase");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const DAY_SEC = 86400;

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function isHttpInvoke(event) {
  return event && typeof event.httpMethod === "string" && event.httpMethod.length > 0;
}

async function logEvent(supabase, row) {
  const { error } = await supabase.from("payment_events").insert(row);
  if (error) console.error("[reconcile-stripe] payment_events", error.message);
}

exports.handler = async (event) => {
  if (isHttpInvoke(event) && event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (isHttpInvoke(event)) {
    const secret = process.env.RECONCILE_SECRET || "";
    if (!secret) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ error: "HTTP reconcile disabled (set RECONCILE_SECRET)" }),
      };
    }
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return {
        statusCode: 401,
        headers: cors(),
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
    }
  }

  const supabase = getSupabaseAdmin();
  const since = Math.floor(Date.now() / 1000) - DAY_SEC;
  const summary = { sessionsChecked: 0, pendingQueued: 0, skipped: 0 };

  try {
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: since },
    });

    for (const s of sessions.data) {
      summary.sessionsChecked += 1;
      if (s.payment_status !== "paid") continue;

      const { data: ps } = await supabase
        .from("processed_sessions")
        .select("session_id, status")
        .eq("session_id", s.id)
        .maybeSingle();

      if (ps?.status === "completed") {
        summary.skipped += 1;
        continue;
      }

      if (ps?.session_id) {
        summary.skipped += 1;
        continue;
      }

      const userId = s.metadata?.user_id;
      if (!userId) continue;

      const nowIso = new Date().toISOString();
      const { error: insErr } = await supabase.from("processed_sessions").insert({
        session_id: s.id,
        user_id: userId,
        status: "pending",
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (insErr) {
        if (insErr.code === "23505") {
          summary.skipped += 1;
          continue;
        }
        console.error("[reconcile-stripe] insert pending", insErr);
        await logEvent(supabase, {
          user_id: userId,
          session_id: s.id,
          event_type: "reconcile_pending_error",
          stripe_event_id: null,
          payload: { message: insErr.message },
        });
        continue;
      }

      summary.pendingQueued += 1;
      await logEvent(supabase, {
        user_id: userId,
        session_id: s.id,
        event_type: "reconcile_pending_queued",
        stripe_event_id: null,
        payload: { note: "awaiting verify-payment" },
      });
    }

    console.log("[reconcile-stripe] done", summary);

    if (isHttpInvoke(event)) {
      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({ ok: true, summary }),
      };
    }

    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (e) {
    console.error("[reconcile-stripe]", e);
    if (isHttpInvoke(event)) {
      return {
        statusCode: 500,
        headers: cors(),
        body: JSON.stringify({ error: e.message }),
      };
    }
    return { statusCode: 500, body: e.message };
  }
};
