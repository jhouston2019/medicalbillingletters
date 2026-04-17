/**
 * Medical bill wizard — Step 3 analysis (GPT-4o, structured JSON).
 */

const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const { verifyWizardAccess } = require("./_wizardAuth");

const MAX_TEXT = 48000;

function corsHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function detectMime(buf) {
  if (!buf || buf.length < 4) return "application/octet-stream";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  return "application/octet-stream";
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

async function transcribeImageWithVision(openai, base64, mime) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe all visible text from this medical bill or EOB image. Preserve line breaks. Output plain text only. Do not summarize.",
          },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${base64}` },
          },
        ],
      },
    ],
  });
  return completion.choices?.[0]?.message?.content || "";
}

async function extractBillText(openai, buffer, mime) {
  if (mime === "application/pdf") {
    const pdfData = await pdfParse(buffer);
    const text = (pdfData && pdfData.text) || "";
    return text.trim();
  }
  if (mime === "image/jpeg" || mime === "image/png") {
    return (await transcribeImageWithVision(openai, buffer.toString("base64"), mime)).trim();
  }
  throw new Error("Unsupported file type. Use PDF, JPG, or PNG.");
}

function defaultStrategies(recommendedId) {
  const base = [
    {
      id: "itemized_review",
      name: "Itemized bill & code verification",
      description: "Request a detailed itemized bill and verify each line item against documented services.",
      aggressiveness: "conservative",
      bestFor: "Unclear charges or bundled services",
      recommended: false,
    },
    {
      id: "coding_correction",
      name: "Coding and charge correction",
      description: "Dispute specific CPT/HCPCS or ICD-10 entries that do not match documented care.",
      aggressiveness: "moderate",
      bestFor: "Upcoding, duplicate lines, or unbundling patterns",
      recommended: false,
    },
    {
      id: "balance_surprise",
      name: "Balance / surprise billing protections",
      description: "Invoke applicable federal or state balance billing protections where the facts support it.",
      aggressiveness: "moderate",
      bestFor: "Out-of-network or emergency context",
      recommended: false,
    },
    {
      id: "payer_coordination",
      name: "Insurance coordination letter",
      description: "Align provider billing with insurer EOB and plan terms; request corrected claim submission.",
      aggressiveness: "conservative",
      bestFor: "Insured patients with EOB or plan documents",
      recommended: false,
    },
    {
      id: "firm_deadline",
      name: "Structured demand with deadline",
      description: "Formal dispute with clear factual basis, regulatory hooks from analysis only, and response deadline.",
      aggressiveness: "aggressive",
      bestFor: "Clear errors with strong documentation",
      recommended: false,
    },
  ];
  const rid = recommendedId && base.some((s) => s.id === recommendedId) ? recommendedId : "coding_correction";
  return base.map((s) => ({
    ...s,
    recommended: s.id === rid,
  }));
}

function normalizePayload(raw, ctx) {
  const rec = raw.recommendedStrategy || (raw.availableStrategies || []).find((s) => s.recommended)?.id || "coding_correction";
  let strategies = Array.isArray(raw.availableStrategies) ? raw.availableStrategies : [];
  if (strategies.length !== 5) {
    strategies = defaultStrategies(rec);
  } else {
    let hasRec = strategies.some((s) => s.recommended);
    if (!hasRec) {
      strategies = strategies.map((s) => ({ ...s, recommended: s.id === rec }));
    }
  }

  const hooks = Array.isArray(raw.regulatoryHooks) ? raw.regulatoryHooks : [];
  const errors = Array.isArray(raw.detectedErrors) ? raw.detectedErrors : [];

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
    summaryForUser: String(raw.summaryForUser || "").slice(0, 2000),
    hardStop: raw.hardStop === true,
    hardStopReason: raw.hardStopReason != null ? String(raw.hardStopReason) : null,
  };
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
    const {
      fileBase64,
      billDate,
      providerType,
      totalBilled,
      insuranceStatus,
      networkStatus,
      serviceType,
      hasEOB,
      priorContact,
      accessToken,
    } = body;

    const auth = await verifyWizardAccess(accessToken);
    if (!auth.ok) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: auth.error }),
      };
    }

    if (!fileBase64 || typeof fileBase64 !== "string") {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "fileBase64 is required" }),
      };
    }

    const buf = Buffer.from(fileBase64, "base64");
    if (buf.length > 10 * 1024 * 1024) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: "File too large (max 10MB)" }),
      };
    }

    const mime = detectMime(buf);
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

    let billText = await extractBillText(openai, buf, mime);
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
              availableStrategies: defaultStrategies("itemized_review"),
              recommendedStrategy: "itemized_review",
              summaryForUser: preStop,
            },
            body
          )
        ),
      };
    }

    const systemPrompt = `You are a medical billing dispute analyst. Output a single JSON object only (no markdown, no prose outside JSON).

CRITICAL RULES:
- Never fabricate CPT, HCPCS, ICD-10, or ICD-9 codes. Only include codes that literally appear in the BILL TEXT or state null if unknown.
- Never invent statute numbers, case names, or regulatory citations. For No Surprises Act use only: "No Surprises Act (Public Law 116-260)" with citation "42 U.S.C. § 300gg-111" when applicable. For ERISA civil enforcement reference use only: "29 U.S.C. § 1132" when ERISA applies.
- Identify patterns consistent with: duplicate charges, upcoding, unbundling, balance billing, surprise bills (when facts fit), not-medically-necessary denials — only when supported by the bill text.
- If serviceType is "emergency" OR networkStatus is "out_of_network", evaluate No Surprises Act applicability using only the bill text; if unsupported by text, do not claim a violation.
- If insuranceStatus is "insured", you may note ERISA plan-related enforcement paths only as a regulatory hook when employer-sponsored plan context is plausible from user context (not from fabricated facts).
- If the bill text includes fraud investigations, EUO, recorded statement demands, or litigation/lawsuit language, set hardStop true with a clear hardStopReason.

Return JSON with keys:
success (boolean true),
riskLevel ("low"|"medium"|"high"),
errorTypes (array of strings from: duplicate_charge, upcoding, balance_billing, unbundling, not_medically_necessary, surprise_bill),
detectedErrors (array of {type, description, cptCode, amount, confidence}),
regulatoryHooks (array of {law, citation, applicability} — only hooks grounded in analysis; use exact NSA/ERISA citations above when those laws apply),
availableStrategies (exactly 5 objects: {id, name, description, aggressiveness, bestFor, recommended}),
recommendedStrategy (id string),
summaryForUser (2-3 sentences, plain language),
hardStop (boolean),
hardStopReason (string or null)

exactly 5 strategies required; one must have recommended true.`;

    const userBlob = {
      billDate,
      providerType,
      totalBilled,
      insuranceStatus,
      networkStatus,
      serviceType,
      hasEOB,
      priorContact,
      billText,
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this medical bill and user context. Context JSON:\n${JSON.stringify(userBlob)}`,
        },
      ],
    });

    const rawText = completion.choices?.[0]?.message?.content;
    if (!rawText) {
      throw new Error("Empty model response");
    }

    const parsed = JSON.parse(rawText);
    const out = normalizePayload(parsed, body);

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
