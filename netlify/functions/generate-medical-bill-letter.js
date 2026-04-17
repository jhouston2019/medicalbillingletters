/**
 * Medical bill wizard — Step 6 letter generation (plain text, six sections).
 */

const OpenAI = require("openai");
const { verifyWizardAccess } = require("./_wizardAuth");

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
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      analysis,
      strategy,
      patientName,
      accountNumber,
      dateOfService,
      providerName,
      disputedAmount,
      specificCharges,
      resolutionAsk,
      billDate,
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
        body: JSON.stringify({ error: auth.error }),
      };
    }

    if (!analysis || !strategy) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "analysis and strategy are required" }),
      };
    }

    if (analysis.hardStop === true) {
      return {
        statusCode: 403,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Cannot generate letter for hard-stop analysis" }),
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      };
    }

    const chargesLines = Array.isArray(specificCharges)
      ? specificCharges
          .map((c) => {
            if (typeof c === "string") return c;
            const d = c.description || "";
            const a = c.amount != null ? String(c.amount) : "";
            const code = c.cptCode != null ? String(c.cptCode) : "";
            return `${d} | ${a} | ${code}`.trim();
          })
          .join("\n")
      : String(specificCharges || "");

    const hooks = Array.isArray(analysis.regulatoryHooks) ? analysis.regulatoryHooks : [];
    const hooksText = hooks
      .map((h) => `- ${h.law || ""} (${h.citation || ""}): ${h.applicability || ""}`)
      .join("\n");

    const errorsText = (Array.isArray(analysis.detectedErrors) ? analysis.detectedErrors : [])
      .map((e) => `- ${e.type}: ${e.description}${e.cptCode ? ` [CPT/HCPCS: ${e.cptCode}]` : ""}${e.amount != null ? ` Amount: ${e.amount}` : ""}`)
      .join("\n");

    const systemPrompt = `You write formal medical billing dispute letters as plain text only.

OUTPUT RULES:
- Plain text only. No HTML, no markdown, no bullet characters, no numbered lists in the letter.
- Exactly six sections in this order, each started with a line containing only the section title in ALL CAPS on its own line, then a blank line, then the section body:
  BACKGROUND
  BASIS FOR DISPUTE
  APPLICABLE BILLING STANDARDS AND REGULATIONS
  PROVIDER OBLIGATIONS
  DEMAND
  RESERVATION OF RIGHTS
- Use professional business letter tone. No attorney-client language. No "we guarantee" or legal advice.
- Insert all factual details from the user payload. There must be no remaining bracket placeholders such as [FIELD NAME] or [YOUR NAME].
- Demand section: include a clear request matching the resolution ask and state that you expect a written response within 10 business days.
- Reservation of Rights: reference escalation paths consistent ONLY with the regulatory hooks provided (e.g. state insurance department, CMS where applicable, state attorney general). Do not invent agencies or citations not supported by those hooks.
- Cite only regulatory hooks from the analysis.regulatoryHooks list verbatim (law names and citations as given). Do not add new statutes or case law.
- Never fabricate CPT/ICD codes; only reference codes that appear in the specific charges or detected errors provided.`;

    const userPayload = {
      strategy,
      patientName,
      accountNumber,
      dateOfService,
      providerName,
      disputedAmount,
      billDate,
      networkStatus,
      serviceType,
      hasEOB,
      priorContact,
      resolutionAsk,
      specificChargesBlock: chargesLines,
      analysisSummary: analysis.summaryForUser,
      detectedErrors: errorsText,
      regulatoryHooks: hooksText,
    };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate the full letter from this JSON:\n${JSON.stringify(userPayload)}`,
        },
      ],
    });

    const letter = completion.choices?.[0]?.message?.content || "";
    if (!letter.trim()) {
      throw new Error("Empty letter from model");
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        letter: letter.trim(),
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
