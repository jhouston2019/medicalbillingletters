/**
 * Medical bill wizard — Step 3 analysis (GPT-4o, structured JSON).
 */

const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const { createClient } = require("@supabase/supabase-js");
const { verifyWizardAnalyzeAccess } = require("./_wizardAuth");
const { getBillingSnapshot } = require("./_billingSnapshot");
const { getSupabaseAdmin } = require("./_supabase");

const MAX_TEXT = 48000;
const MIN_EXTRACTED_TEXT = 50;

const VISION_EXTRACT_PROMPT =
  "Extract all text from this medical bill. " +
  "Return only the raw text content, preserving line breaks and structure as much as possible. " +
  "Include all charges, codes, dates, and amounts.";

function corsHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

/** Never fails auth — invalid/missing JWT falls back to anonymous guest analysis (no 401). */
async function resolveAnalyzeAuth(event, body) {
  const accessTokenBody = body?.accessToken;
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  let token =
    typeof accessTokenBody === "string" && accessTokenBody.trim() ? accessTokenBody.trim() : null;
  if (!token && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token || token === "bypass") {
    return { ok: true, bypass: true, userId: null, email: null, guestAnalyze: true };
  }

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: true, bypass: true, userId: null, email: null, guestAnalyze: true };
  }

  const supabase = createClient(url, anon);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: true, bypass: true, userId: null, email: null, guestAnalyze: true };
  }

  return { ok: true, bypass: false, userId: user.id, email: user.email, guestAnalyze: false };
}

function detectMime(buf) {
  if (!buf || buf.length < 4) return "application/octet-stream";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  return "application/octet-stream";
}

/** Prefer magic-byte detection; fall back to client fileType when ambiguous. */
function resolveMime(buf, fileType) {
  const d = detectMime(buf);
  if (d === "application/pdf" || d === "image/jpeg" || d === "image/png") return d;
  if (fileType === "image/jpeg" || fileType === "image/png" || fileType === "application/pdf") return fileType;
  return d;
}

function hardStopFromBillText(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.toLowerCase();
  if (/\bfraud\b/.test(t) && /(investigation|allegation|suspected)/.test(t)) {
    return "This document appears to reference fraud investigation or allegations. Professional representation is required.";
  }
  if (/examination under oath|\beuo\b/.test(t)) {
    return "This document references an Examination Under Oath (EUO). Professional representation is required.";
  }
  if (/recorded statement/.test(t) && /(require|request|demand)/.test(t)) {
    return "This document references a recorded statement request. Professional representation is required.";
  }
  if (/\blitigation\b|\blawsuit\b|attorney.*demand|sued|court order/i.test(t)) {
    return "This document references litigation or legal action. Professional representation is required.";
  }
  return null;
}

/** True when extracted text likely contains bill line items, not just headers/footers. */
function billTextLooksUsable(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < MIN_EXTRACTED_TEXT) return false;
  if (trimmed.startsWith("[Bill text could not be extracted")) return false;

  const hasCpt = /\b\d{5}\b/.test(trimmed);
  const hasAmount =
    /\$\s?\d[\d,]*(\.\d{2})?/.test(trimmed) || /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/.test(trimmed);
  const hasIcd = /\b[A-TV-Z][0-9][A-Z0-9](?:\.[A-Z0-9]{1,4})?\b/i.test(trimmed);

  if (trimmed.length >= 500 && (hasCpt || hasAmount)) return true;
  if (trimmed.length >= 200 && hasCpt && hasAmount) return true;
  if (hasCpt || hasIcd || hasAmount) return trimmed.length >= 120;
  return trimmed.length >= 400;
}

async function visionExtractBillText(openai, fileBase64, mediaType) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mediaType};base64,${fileBase64}`,
              detail: "high",
            },
          },
          { type: "text", text: VISION_EXTRACT_PROMPT },
        ],
      },
    ],
  });
  return completion.choices?.[0]?.message?.content || "";
}

function metadataFallbackText(ctx) {
  const { providerType, totalBilled, insuranceStatus, networkStatus, serviceType } = ctx;
  return (
    "[Bill text could not be extracted. " +
    "Analyze based on the metadata provided: " +
    `Provider: ${providerType}, ` +
    `Total billed: ${totalBilled}, ` +
    `Insurance status: ${insuranceStatus}, ` +
    `Network status: ${networkStatus}, ` +
    `Service type: ${serviceType}]`
  );
}

/**
 * Multi-method extraction: pdf-parse (×2), then OpenAI vision (PDF / image / jpeg mime fallback), then metadata stub.
 * Never throws — returns at least the metadata fallback string.
 */
async function extractBillText(openai, buffer, mime, fileBase64, ctx) {
  const b64 = fileBase64 && typeof fileBase64 === "string" ? fileBase64 : buffer.toString("base64");
  const fallback = () => metadataFallbackText(ctx);

  const tryPdfParse = async (label, opts) => {
    try {
      const pdfData = opts ? await pdfParse(buffer, opts) : await pdfParse(buffer);
      const text = (pdfData && pdfData.text) || "";
      return typeof text === "string" ? text.trim() : "";
    } catch (e) {
      console.warn(`[analyze-medical-bill] pdf-parse ${label} failed:`, e.message);
      return "";
    }
  };

  // METHOD 4 — Images: skip pdf-parse; vision only
  if (mime === "image/jpeg" || mime === "image/png") {
    try {
      const t = await visionExtractBillText(openai, b64, mime);
      if (billTextLooksUsable(t)) return t.trim();
    } catch (e) {
      console.warn("[analyze-medical-bill] vision (image) failed:", e.message);
    }
    try {
      const t = await visionExtractBillText(openai, b64, "image/jpeg");
      if (billTextLooksUsable(t)) return t.trim();
    } catch (e) {
      console.warn("[analyze-medical-bill] vision (image as jpeg mime) failed:", e.message);
    }
    return fallback();
  }

  if (mime !== "application/pdf") {
    return fallback();
  }

  // METHOD 1 — pdf-parse default
  let text = await tryPdfParse("attempt1", undefined);
  if (billTextLooksUsable(text)) return text;

  // METHOD 2 — pdf-parse explicit lenient options (same defaults; second pass after partial failure / short text)
  const text2 = await tryPdfParse("attempt2", { max: 0 });
  if (billTextLooksUsable(text2)) return text2;
  if (text2.length > text.length) text = text2;

  // METHOD 3 — Vision: PDF as base64 (then jpeg media-type fallback per API quirks)
  try {
    const t = await visionExtractBillText(openai, b64, "application/pdf");
    if (billTextLooksUsable(t)) return t.trim();
  } catch (e) {
    console.warn("[analyze-medical-bill] vision (application/pdf) failed:", e.message);
  }
  try {
    const t = await visionExtractBillText(openai, b64, "image/jpeg");
    if (billTextLooksUsable(t)) return t.trim();
  } catch (e) {
    console.warn("[analyze-medical-bill] vision (image/jpeg mime fallback) failed:", e.message);
  }

  if (text.length > 0) return text;
  return fallback();
}

function defaultStrategies(recommendedId) {
  const base = [
    {
      id: "verify_insurance_coverage",
      name: "Verify Insurance Coverage",
      description: "Confirm what your insurer paid and what you owe before disputing specific charges.",
      aggressiveness: "conservative",
      bestFor: "Unclear EOB vs. bill differences or coverage questions",
      recommended: false,
    },
    {
      id: "request_detailed_bill",
      name: "Request Detailed Bill",
      description: "Request an itemized statement with CPT/HCPCS codes, dates, and units for each charge.",
      aggressiveness: "moderate",
      bestFor: "Bundled or vague line items without supporting detail",
      recommended: false,
    },
    {
      id: "formal_written_dispute",
      name: "Formal Written Dispute",
      description: "Send a structured written dispute citing factual errors and requesting correction in writing.",
      aggressiveness: "moderate",
      bestFor: "Documented billing errors with clear supporting facts",
      recommended: false,
    },
    {
      id: "consult_billing_advocate",
      name: "Consult with a Billing Advocate",
      description: "Engage a patient billing advocate to review charges and negotiate on your behalf.",
      aggressiveness: "moderate",
      bestFor: "Complex bills or when you want expert negotiation support",
      recommended: false,
    },
    {
      id: "file_insurance_appeal",
      name: "File an Appeal with Insurance",
      description: "Submit a formal internal appeal to your insurer with supporting documentation.",
      aggressiveness: "aggressive",
      bestFor: "Denied or underpaid claims with insurer documentation",
      recommended: false,
    },
    {
      id: "file_regulatory_complaint",
      name: "File Regulatory Complaint",
      description: "File a complaint with state or federal regulators for billing violations, including No Surprises Act / balance billing issues when supported by the facts.",
      aggressiveness: "aggressive",
      bestFor: "No Surprises Act / balance billing violations",
      recommended: false,
    },
    {
      id: "seek_legal_advice",
      name: "Seek Legal Advice",
      description: "Consult a qualified healthcare attorney when disputes involve significant amounts or legal complexity.",
      aggressiveness: "aggressive",
      bestFor: "High-dollar disputes, collections threats, or legal notices",
      recommended: false,
    },
  ];
  const rid =
    recommendedId && base.some((s) => s.id === recommendedId)
      ? recommendedId
      : "request_detailed_bill";
  return base.map((s) => ({
    ...s,
    recommended: s.id === rid,
  }));
}

function normalizePayload(raw, ctx, textExtractionFailed = false) {
  const rec = raw.recommendedStrategy || (raw.availableStrategies || []).find((s) => s.recommended)?.id || "request_detailed_bill";
  let strategies = Array.isArray(raw.availableStrategies) ? raw.availableStrategies : [];
  if (strategies.length !== 7) {
    strategies = defaultStrategies(rec);
  } else {
    let hasRec = strategies.some((s) => s.recommended);
    if (!hasRec) {
      strategies = strategies.map((s) => ({ ...s, recommended: s.id === rec }));
    }
  }

  const hooks = Array.isArray(raw.regulatoryHooks) ? raw.regulatoryHooks : [];
  const errors = Array.isArray(raw.detectedErrors) ? raw.detectedErrors : [];

  const extractionSummary =
    "We couldn't extract text from your bill — it may be a scanned image. Your letter will be based on the information you provided. For best results, upload a text-based PDF.";

  const aiSummary = String(raw.summaryForUser || "").slice(0, 2000);
  let summaryForUser = aiSummary;
  if (textExtractionFailed) {
    if (aiSummary && !aiSummary.startsWith(extractionSummary)) {
      summaryForUser = `${extractionSummary} ${aiSummary}`.slice(0, 2000);
    } else if (!aiSummary) {
      summaryForUser = extractionSummary;
    }
  }

  return {
    success: true,
    riskLevel: ["low", "medium", "high"].includes(raw.riskLevel) ? raw.riskLevel : "medium",
    errorTypes: Array.isArray(raw.errorTypes) ? raw.errorTypes : [],
    detectedErrors: errors.map((e) => ({
      type: String(e.type || "unknown"),
      description: String(e.description || ""),
      cptCode: e.cptCode != null ? String(e.cptCode) : null,
      amount: typeof e.amount === "number" ? e.amount : e.amount != null ? Number(e.amount) : null,
      confidence: ["confirmed", "likely", "possible"].includes(e.confidence) ? e.confidence : "possible",
    })),
    regulatoryHooks: hooks.map((h) => ({
      law: String(h.law || ""),
      citation: String(h.citation || ""),
      applicability: String(h.applicability || ""),
    })),
    availableStrategies: strategies,
    recommendedStrategy: String(rec),
    summaryForUser,
    hardStop: raw.hardStop === true,
    hardStopReason: raw.hardStopReason != null ? String(raw.hardStopReason) : null,
    textExtractionFailed: textExtractionFailed === true,
  };
}

async function resolveUsageSessionId(supabase, userId, requestedSessionId) {
  if (requestedSessionId && typeof requestedSessionId === "string") {
    const { data } = await supabase
      .from("processed_sessions")
      .select("session_id")
      .eq("session_id", requestedSessionId.trim())
      .eq("user_id", userId)
      .eq("status", "completed")
      .maybeSingle();
    if (data?.session_id) return data.session_id;
    return null;
  }

  const { data: sessions } = await supabase
    .from("processed_sessions")
    .select("session_id, updated_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("updated_at", { ascending: false });

  for (const row of sessions || []) {
    const { count } = await supabase
      .from("user_review_usage")
      .select("id", { count: "exact", head: true })
      .eq("session_id", row.session_id);
    if ((count ?? 0) === 0) return row.session_id;
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    console.log("ANALYZE RUNNING - ANONYMOUS OK");
    await verifyWizardAnalyzeAccess(event);

    const auth = await resolveAnalyzeAuth(event, body);

    const {
      fileBase64,
      fileType,
      billDate,
      providerType,
      totalBilled,
      insuranceStatus,
      networkStatus,
      serviceType,
      hasEOB,
      priorContact,
      usageSessionId,
    } = body;

    const supabase = getSupabaseAdmin();
    let usageSessionIdToUse = null;

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
      if (snap.usage.limit != null && snap.usage.used >= snap.usage.limit) {
        return {
          statusCode: 403,
          headers: corsHeaders(),
          body: JSON.stringify({
            success: false,
            error: "Usage limit exceeded for your plan",
            usage: snap.usage,
          }),
        };
      }

      usageSessionIdToUse = await resolveUsageSessionId(
        supabase,
        auth.userId,
        usageSessionId
      );
      if (!usageSessionIdToUse) {
        return {
          statusCode: 403,
          headers: corsHeaders(),
          body: JSON.stringify({
            success: false,
            error:
              "No completed checkout session available for a new review. Purchase again or pass usageSessionId from a verified payment.",
          }),
        };
      }

      const { data: ownedSession, error: ownErr } = await supabase
        .from("processed_sessions")
        .select("*")
        .eq("session_id", usageSessionIdToUse)
        .eq("user_id", auth.userId)
        .eq("status", "completed")
        .maybeSingle();

      if (ownErr || !ownedSession) {
        return {
          statusCode: 403,
          headers: corsHeaders(),
          body: JSON.stringify({
            success: false,
            error: "Checkout session is not verified for this account.",
          }),
        };
      }

      const { data: existingUsage } = await supabase
        .from("user_review_usage")
        .select("analysis_json")
        .eq("session_id", usageSessionIdToUse)
        .maybeSingle();

      if (existingUsage?.analysis_json != null) {
        return {
          statusCode: 200,
          headers: corsHeaders(),
          body: JSON.stringify(existingUsage.analysis_json),
        };
      }
    }

    if (!fileBase64 || typeof fileBase64 !== "string") {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "fileBase64 is required" }),
      };
    }

    const fileBuffer = Buffer.from(fileBase64, "base64");
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "File too large (max 10MB)" }),
      };
    }

    const mime = resolveMime(fileBuffer, fileType);
    if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "Invalid file type" }),
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
      };
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const extractCtx = {
      providerType,
      totalBilled,
      insuranceStatus,
      networkStatus,
      serviceType,
    };

    // Extract bill text — prefer vision when pdf-parse returns junk headers only
    let billText = "";
    if (mime === "application/pdf") {
      try {
        const pdfData = await pdfParse(fileBuffer);
        billText = String(pdfData?.text || "").trim();
      } catch (e) {
        console.warn("[analyze-medical-bill] pdf-parse extraction failed:", e.message);
      }
    }

    if (!billTextLooksUsable(billText)) {
      const extracted = await extractBillText(openai, fileBuffer, mime, fileBase64, extractCtx);
      const extractedText = String(extracted || "").trim();
      if (
        extractedText &&
        (extractedText.length > billText.length || !billTextLooksUsable(billText))
      ) {
        billText = extractedText;
      }
    }

    const textExtractionFailed =
      !billTextLooksUsable(billText) || billText.startsWith("[Bill text could not be extracted");

    if (billText.length > MAX_TEXT) {
      billText = billText.slice(0, MAX_TEXT) + "\n[TRUNCATED]";
    }

    const preStop = hardStopFromBillText(billText);
    if (preStop) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify(
          normalizePayload(
            {
              hardStop: true,
              hardStopReason: preStop,
              riskLevel: "high",
              errorTypes: [],
              detectedErrors: [],
              regulatoryHooks: [],
              availableStrategies: defaultStrategies("verify_insurance_coverage"),
              recommendedStrategy: "verify_insurance_coverage",
              summaryForUser: preStop,
            },
            body
          )
        ),
      };
    }

    const systemPrompt = `You are a medical billing expert. Analyze the following medical bill text and metadata.

BILL TEXT:
${billText || "[No bill text extracted]"}

METADATA:
- Provider type: ${providerType}
- Total billed: ${totalBilled}
- Bill date: ${billDate}
- Insurance status: ${insuranceStatus}
- Network status: ${networkStatus}
- Service type: ${serviceType}
- Has EOB: ${hasEOB}
- Prior contact: ${priorContact}

Extract ALL of the following from the bill text:
1. Every CPT code present — list each with its description and billed amount
2. Every ICD-10 code present
3. Duplicate line items (same CPT code billed more than once)
4. Unbundled charges (component codes that should be billed as a single bundled code)
5. Upcoded charges (CPT code billed at higher complexity than documented)
6. Any balance billing above in-network rates
7. Any surprise bill charges covered by the No Surprises Act (Public Law 116-260, 42 USC § 300gg-111)
8. Any line items lacking medical necessity documentation

CRITICAL RULES:
- Never fabricate CPT or ICD-10 codes — only cite codes present in the bill text above
- If no CPT codes are found in the bill text, say so explicitly and base the dispute on the available metadata
- Always return the full JSON response shape — do not truncate
- riskLevel must reflect actual findings: if errors are found, use 'medium' or 'high', not 'low'
- summaryForUser must be specific to what was found — never generic
- Never invent statute numbers beyond No Surprises Act (Public Law 116-260, 42 U.S.C. § 300gg-111) and ERISA (29 U.S.C. § 1132) when applicable
- If the bill text includes fraud investigations, EUO, recorded statement demands, or litigation/lawsuit language, set hardStop true with a clear hardStopReason

Output a single JSON object only (no markdown, no prose outside JSON).

Return JSON with keys:
success (boolean true),
riskLevel ("low"|"medium"|"high"),
errorTypes (array of strings from: duplicate_charge, upcoding, balance_billing, unbundling, not_medically_necessary, surprise_bill),
detectedErrors (array of {type, description, cptCode, amount, confidence}),
regulatoryHooks (array of {law, citation, applicability}),
availableStrategies (exactly 7 objects: {id, name, description, aggressiveness, bestFor, recommended}),
recommendedStrategy (id string),
summaryForUser (2-3 sentences, plain language, specific to findings),
hardStop (boolean),
hardStopReason (string or null)

Exactly 7 strategies required; one must have recommended true. Use these exact strategy names:
1. Verify Insurance Coverage (conservative)
2. Request Detailed Bill (moderate)
3. Formal Written Dispute (moderate)
4. Consult with a Billing Advocate (moderate)
5. File an Appeal with Insurance (aggressive)
6. File Regulatory Complaint (aggressive)
7. Seek Legal Advice (aggressive)`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: "Analyze this medical bill and return the JSON object.",
        },
      ],
    });

    const choice = completion.choices?.[0];
    const rawText = choice?.message?.content;
    if (!rawText) {
      throw new Error("Empty model response");
    }
    if (choice?.finish_reason === "length") {
      console.warn("[analyze-medical-bill] Model response truncated at max_tokens");
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("[analyze-medical-bill] JSON parse failed:", parseErr.message);
      throw new Error("Analysis response was incomplete — please try again");
    }
    const out = normalizePayload(parsed, body, textExtractionFailed);

    if (auth.userId && !auth.bypass && !out.hardStop && usageSessionIdToUse) {
      const { data: sessionOk } = await supabase
        .from("processed_sessions")
        .select("session_id")
        .eq("session_id", usageSessionIdToUse)
        .eq("user_id", auth.userId)
        .eq("status", "completed")
        .maybeSingle();

      if (!sessionOk?.session_id) {
        return {
          statusCode: 403,
          headers: corsHeaders(),
          body: JSON.stringify({
            success: false,
            error: "Checkout session is not verified for this account.",
          }),
        };
      }

      const { error: usageErr } = await supabase.from("user_review_usage").insert({
        user_id: auth.userId,
        session_id: usageSessionIdToUse,
        analysis_json: out,
      });
      if (usageErr) {
        if (usageErr.code === "23505") {
          const { data: row } = await supabase
            .from("user_review_usage")
            .select("analysis_json")
            .eq("session_id", usageSessionIdToUse)
            .maybeSingle();
          if (row?.analysis_json != null) {
            return {
              statusCode: 200,
              headers: corsHeaders(),
              body: JSON.stringify(row.analysis_json),
            };
          }
        }
        console.warn("[analyze-medical-bill] user_review_usage insert:", usageErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(out),
    };
  } catch (err) {
    console.error("analyze-medical-bill error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: false,
        error: err.message || "Analysis failed",
      }),
    };
  }
};
