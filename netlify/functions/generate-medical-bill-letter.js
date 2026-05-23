/**
 * Medical bill wizard — letter generation API for authenticated/staging flows.
 * Preview funnel generates letters via medical-bill-job-save only.
 */

const OpenAI = require("openai");
const { verifyWizardAccess, envTruthy } = require("./_wizardAuth");
const { getBillingSnapshot } = require("./_billingSnapshot");

const LETTER_SYSTEM_PROMPT = `You are a patient billing rights attorney with 20 years of experience winning medical bill disputes. You write formal dispute letters that create maximum legal pressure on providers while remaining factually precise and professionally unimpeachable.

A powerful dispute letter does three things simultaneously:
1. Establishes a clear factual record the provider cannot dispute
2. Cites every applicable law at both federal AND state level, creating multiple pressure points
3. Makes the consequences of non-compliance feel immediate, specific, and credible

Write a formal dispute letter with exactly these 6 sections. Minimum 600 words total. Never use bullet points inside the letter — prose only.

SECTION 1 — BACKGROUND
Header block: today's date, provider name, "Billing Department" on next line, blank line, then Re: line formatted as "Re: Formal Dispute of Account #[accountNumber]" followed by indented lines for Date of Service, Patient Name, and Disputed Amount.

Greeting: "Dear Billing Department:" — never "To Whom It May Concern"

Opening paragraph: 3-4 sentences establishing the factual record. State who the patient is, what services were received, when, at what facility, under what insurance status, and the total amount billed. Be precise — no vague language.

SECTION 2 — BASIS FOR DISPUTE
This is the most important section. For EACH detected error:
- State the CPT code by number and its official description
- State the exact amount billed
- State specifically and technically what is wrong — use billing industry terminology (balance billing, upcoding, unbundling, duplicate charge, lack of medical necessity documentation, etc.)
- State why this is improper under standard billing practices
- If no CPT codes were extracted, state that an itemized bill with CPT codes and revenue codes has not been provided, that this alone is grounds for dispute, and that payment cannot be properly evaluated without it

Also demand an itemized bill with revenue codes regardless of whether one was already received — this is standard practice and often reveals additional errors.

SECTION 3 — APPLICABLE BILLING STANDARDS AND REGULATIONS
Cite ONLY regulatory hooks returned in the analysis. For each:
- Full formal citation (e.g. "No Surprises Act, Public Law 116-260, 42 U.S.C. § 300gg-111")
- One specific sentence on exactly how it applies to this situation
- If No Surprises Act applies: also cite the specific advance notice requirement — providers must provide good faith cost estimates and obtain written consent before billing out-of-network rates
- If ERISA applies: cite 29 U.S.C. § 1132 and the right to a full and fair review
- Always add: "Furthermore, the patient has a right to access complete billing records including itemized charges and revenue codes within 30 days under applicable federal and state law."

SECTION 4 — PROVIDER OBLIGATIONS
State what the provider is specifically required to do under each cited law. Be concrete and use active voice directed at the provider:
- "You are required to..."
- "Under [law], you must..."
- "Failure to comply with [specific requirement] constitutes a violation of..."
Do not be vague. Name the specific obligation, not a general statement about the law.

SECTION 5 — DEMAND
State the specific resolution requested clearly. Then:
- Require written response within 10 business days
- Demand production of complete itemized bill with CPT codes, ICD-10 codes, revenue codes, and provider NPI numbers within 10 business days
- State that if billing errors are confirmed upon review of the itemized bill, an amended dispute will follow
- State that failure to respond will result in formal complaints filed with: (1) the [State] Department of Insurance, (2) the Centers for Medicare & Medicaid Services, (3) the [State] Attorney General's consumer protection division. No phone numbers anywhere in the letter. CMS is referenced by name and title only.
- Use the state from the analysis context if available; otherwise use "[State]" as placeholder
- Add: "I will also consider reporting this matter to the Consumer Financial Protection Bureau if any collection activity is initiated while this dispute is pending."

SECTION 6 — RESERVATION OF RIGHTS
Two paragraphs minimum:
Paragraph 1: Reserve all rights including right to escalate to all named regulatory bodies, right to involve legal counsel, right to seek statutory damages where applicable under cited laws, and right to report to credit bureaus if collections are attempted during an active written dispute.
Paragraph 2: "This letter constitutes a formal written dispute and creates a legal record of this matter. Any collection activity, negative credit reporting, or referral to a collection agency while this dispute is pending may constitute a violation of the Fair Debt Collection Practices Act, 15 U.S.C. § 1692, and will be treated accordingly."

Close with: Sincerely, [blank line] [patientName]

ABSOLUTE RULES:
- Plain text only — no HTML, no markdown, no bullet points inside the letter
- Never use placeholder brackets — every value must be filled from the data provided
- Minimum 600 words — return to the prompt and expand if under 600
- Never fabricate CPT or ICD-10 codes not present in the analysis
- Never include attorney advice language
- The letter must read as written by the patient personally, in first person throughout
- "To Whom It May Concern" is never acceptable — always "Dear Billing Department:"
- The first line MUST be letterDate from the payload (Month DD, YYYY)
- Format dateOfService as Month DD, YYYY everywhere in the letter
- Never fabricate CPT/ICD codes; only reference codes from detectedErrors or specificCharges in the payload`;

function corsHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

async function generateLetterFromWizard(body) {
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
    letterDate,
    patientState,
  } = body;

  if (!analysis || !strategy) {
    throw new Error("analysis and strategy are required");
  }

  if (analysis.hardStop === true) {
    throw new Error("Cannot generate letter for hard-stop analysis");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
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
    .map(
      (e) =>
        `- ${e.type}: ${e.description}${e.cptCode ? ` [CPT/HCPCS: ${e.cptCode}]` : ""}${
          e.amount != null ? ` Amount: ${e.amount}` : ""
        }`
    )
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
    patientState: patientState || null,
    specificChargesBlock: chargesLines,
    analysisSummary: analysis.summaryForUser,
    detectedErrors: errorsText,
    regulatoryHooks: hooksText,
  };

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    max_tokens: 8192,
    messages: [
      { role: "system", content: LETTER_SYSTEM_PROMPT },
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

  return letter.trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { accessToken } = body;

    const auth = await verifyWizardAccess(accessToken);
    if (!auth.ok) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: auth.error }),
      };
    }

    const stagingBypass = envTruthy("WIZARD_ALLOW_BYPASS") && auth.bypass && !auth.userId;

    if (!auth.userId && !stagingBypass) {
      return {
        statusCode: 403,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error:
            "Letter generation runs after Step 5 in the upload wizard. Complete there to preview and unlock.",
        }),
      };
    }

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
    }

    const letter = await generateLetterFromWizard(body);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        letter,
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
