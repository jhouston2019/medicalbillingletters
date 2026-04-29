/**
 * After Stripe Checkout: verify payment, create or resolve Supabase user, finalize entitlements, return session tokens.
 * Does not send email; email_confirm is set server-side. Body email must match Stripe checkout session email.
 */

const crypto = require("crypto");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { getSupabaseAdmin } = require("./_supabase");
const { normalizePlan } = require("./_billingSnapshot");
const { expiresAtForPlan } = require("./_planExpiry");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

function checkoutEmailFromStripe(session) {
  const a = session.customer_details?.email;
  if (a && String(a).trim()) return normalizeEmail(a);
  const b = session.customer_email;
  if (b && String(b).trim()) return normalizeEmail(b);
  const cust = session.customer;
  if (cust && typeof cust === "object" && cust.email) return normalizeEmail(cust.email);
  return null;
}

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

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_ANON_KEY is not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findAuthUserByEmail(supabaseAdmin, email) {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const u = users.find((x) => normalizeEmail(x.email) === target);
    if (u) return u;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function issueSessionTokens(supabaseAdmin, email, password) {
  const anon = getSupabaseAnon();
  const signIn = await anon.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data?.session) {
    return {
      access_token: signIn.data.session.access_token,
      refresh_token: signIn.data.session.refresh_token,
    };
  }

  console.warn("[create-account-from-payment] signInWithPassword:", signIn.error?.message);

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    const msg = [
      signIn.error?.message,
      linkErr?.message,
      !tokenHash ? "generateLink missing hashed_token" : null,
    ]
      .filter(Boolean)
      .join(" | ");
    throw new Error(msg || "Could not create session");
  }

  const otp = await anon.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });

  if (otp.error || !otp.data?.session) {
    throw new Error(
      [otp.error?.message, signIn.error?.message].filter(Boolean).join(" | ") || "Could not create session"
    );
  }

  return {
    access_token: otp.data.session.access_token,
    refresh_token: otp.data.session.refresh_token,
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
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const session_id = String(body.session_id ?? body.sessionId ?? "").trim();
    const emailRaw = body.email;
    if (!session_id) {
      return {
        statusCode: 400,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "session_id required" }),
      };
    }
    if (!emailRaw || typeof emailRaw !== "string" || !normalizeEmail(emailRaw)) {
      return {
        statusCode: 400,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "email required" }),
      };
    }
    const email = normalizeEmail(emailRaw);

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(session_id, {
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

    const stripeEmail = checkoutEmailFromStripe(session);
    if (!stripeEmail || stripeEmail !== email) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Email does not match checkout session" }),
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

    const supabase = getSupabaseAdmin();
    const password = randomPassword();

    let userId;
    const existingUser = await findAuthUserByEmail(supabase, email);

    if (existingUser?.id) {
      userId = existingUser.id;
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) {
        console.error("[create-account-from-payment] updateUserById", updErr);
        return {
          statusCode: 500,
          headers: cors(),
          body: JSON.stringify({ success: false, error: "Could not prepare account" }),
        };
      }
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (!createErr && created?.user?.id) {
        userId = created.user.id;
      } else {
        const again = await findAuthUserByEmail(supabase, email);
        if (again?.id) {
          userId = again.id;
          const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
          });
          if (updErr) {
            console.error("[create-account-from-payment] update after race", updErr);
            return {
              statusCode: 500,
              headers: cors(),
              body: JSON.stringify({ success: false, error: "Could not prepare account" }),
            };
          }
        } else {
          console.error("[create-account-from-payment] createUser", createErr);
          return {
            statusCode: 500,
            headers: cors(),
            body: JSON.stringify({ success: false, error: "Could not create account" }),
          };
        }
      }
    }

    const planType = planFromStripeSession(session);
    const periodEndIso = stripePeriodEndIso(session);
    const expiresAt = periodEndIso || expiresAtForPlan(planType);
    const stripePeriodEnd = periodEndIso;

    const amountTotal = session.amount_total != null ? session.amount_total : null;
    const currency = session.currency != null ? String(session.currency) : null;

    const { data: fin, error: finErr } = await supabase.rpc("finalize_verified_checkout", {
      p_session_id: session_id,
      p_user_id: userId,
      p_stripe_customer_id: stripeCustomerId,
      p_plan_type: planType,
      p_expires_at: expiresAt,
      p_stripe_period_end: stripePeriodEnd,
    });

    if (finErr) {
      console.error("[create-account-from-payment] finalize_verified_checkout", finErr);
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
        body: JSON.stringify({ success: false, error: "Session is tied to another account" }),
      };
    }

    if (!fin?.ok) {
      return {
        statusCode: 403,
        headers: cors(),
        body: JSON.stringify({ success: false, error: "Could not finalize entitlement" }),
      };
    }

    let refreshed = session;
    try {
      refreshed = await stripe.checkout.sessions.retrieve(session_id);
    } catch (e) {
      console.warn("[create-account-from-payment] retrieve refresh failed", e?.message || e);
    }

    const job_id = refreshed.metadata?.job_id;

    console.log("SESSION METADATA:", refreshed.metadata || {});

    if (!job_id || String(job_id).trim() === "") {
      console.warn(
        "[create-account-from-payment] No job_id on Stripe session.metadata — appeal stays locked."
      );
    } else {
      console.log("UNLOCKING JOB:", job_id);

      await supabase
        .from("medical_bill_jobs")
        .update({
          paid: true,
          is_unlocked: true,
        })
        .eq("id", job_id);
    }

    if (fin?.already !== true) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: priorVerified } = await supabase
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_type", "payment_verified")
        .gte("created_at", tenMinAgo);

      const riskFlag = (priorVerified ?? 0) >= 2;
      const riskReason = riskFlag ? "rapid_checkout_pattern" : null;

      const { error: logErr } = await supabase.from("payment_events").insert({
        user_id: userId,
        session_id: session_id,
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
        console.error("[create-account-from-payment] payment_events insert", logErr);
      }
    }

    let tokens;
    try {
      tokens = await issueSessionTokens(supabase, email, password);
    } catch (e) {
      console.error("[create-account-from-payment] signIn", e);
      const msg = e instanceof Error ? e.message : String(e);
      return {
        statusCode: 500,
        headers: cors(),
        body: JSON.stringify({
          success: false,
          error: "Could not establish session",
          details: msg,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        success: true,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      }),
    };
  } catch (err) {
    console.error("create-account-from-payment", err);
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ success: false, error: err.message || "Failed" }),
    };
  }
};
