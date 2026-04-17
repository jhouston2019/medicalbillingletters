/**
 * Medical bill wizard — Step 6 letter generation (plain text, formal dispute letter).
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
      letterDate,
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

    const formattedDOS =
      dateOfService != null && String(dateOfService).trim() !== ""
        ? (() => {
            const raw = String(dateOfService).trim();
            const d = new Date(raw + "T00:00:00");
            return Number.isNaN(d.getTime())
              ? raw
              : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
          })()
        : dateOfService;

    const titleCaseName =
      patientName != null && String(patientName).trim() !== ""
        ? String(patientName)
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        : patientName;

    const systemPrompt = `You write formal medical billing dispute letters as plain text only — formatted as real legal correspondence, not an outline or memo with section labels.

OUTPUT FORMAT (plain text only — no HTML, no markdown, no bullet lists, no numbered lists):
- Output a formal legal correspondence letter.
- Do NOT use bold, ALL CAPS section headers, or labels such as BACKGROUND, BASIS FOR DISPUTE, etc. The letter must read as continuous formal prose.
- The first line of the letter MUST be exactly the letterDate value from the user JSON (field "letterDate"), formatted as provided (Month DD, YYYY). Do not invent a different date.
- Format dateOfService everywhere in the letter (including the Re: block and body) as Month DD, YYYY (e.g. "April 15, 2026") — never ISO format (YYYY-MM-DD).
- After one blank line, the inside address block: providerName on its own line, then "Billing Department" on the next line.
- After one blank line, a "Re:" block (use "Re: Formal Dispute — Account #[account number]" with the real account number inserted). On the following lines in the same block, indented with spaces as in a formal letter: Date of Service (use the formatted date only), Patient: (label exactly "Patient:" followed by the name), Disputed Amount with dollar amount — all filled from the payload with real values.
- After one blank line, the salutation: "Dear Billing Department:"
- Body: separate paragraphs with a blank line between each. Order and substance:
  1) Opening: one sentence stating that this letter is a formal dispute of the charges.
  2) Background: who, what, when, account number, amount billed, service type, insurance/network context from the payload.
  3) Basis for dispute: specific billing problems and violations; cite statutes and hooks from regulatoryHooks only, verbatim law names and citations as given; assertive direct language (state what the billing practice is and why it violates the cited standard — no "may be" or "may not").
  4) Applicable regulations: what the cited laws require, using only hooks provided.
  5) Provider obligations: what the provider IS required to do under those regulations (not "should" or "may need to").
  6) Demand: use "I demand" followed by the resolution matching resolutionAsk in plain language. In the same paragraph: require a written response within 10 business days; state that failure to comply will result in escalation to the relevant regulatory bodies (name only bodies consistent with the regulatory hooks provided — e.g. state insurance department, CMS where applicable, state attorney general — do not invent agencies).
  7) Reservation of rights: one short paragraph preserving all rights and remedies.
- Closing: after a blank line, "Sincerely," then a blank line, then the patient name on its own line (use patientName from the JSON payload exactly as given). Nothing may follow the patient name — no certified mail line, no "formal written notice" line, and no other closing lines.

FACTUAL AND LEGAL CONSTRAINTS:
- Insert every factual value from the user payload; no remaining bracket placeholders such as [FIELD NAME], [YOUR NAME], or [accountNumber].
- Cite only regulatory hooks from analysis.regulatoryHooks verbatim; do not add statutes, case law, or agencies not supported by those hooks.
- Never fabricate CPT/ICD codes; only reference codes from specific charges or detected errors in the payload.
- No attorney-client language; no "we guarantee"; no legal advice disclaimers inside the letter body.

TONE:
- Firm, professional, and assertive throughout: "I demand", direct statements of violation, no hedging.`;

    const userPayload = {
      letterDate: letterDate || null,
      strategy,
      patientName: titleCaseName,
      accountNumber,
      dateOfService: formattedDOS,
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
