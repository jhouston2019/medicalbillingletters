/**
 * Shared GPT letter generation for medical bill wizard (plain text dispute letter).
 */

const OpenAI = require("openai");

function parseMoneyStr(s) {
  const n = parseFloat(String(s || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {object} body - Same shape as generate-medical-bill-letter handler body
 * @returns {Promise<string>}
 */
async function generateMedicalBillLetterFromWizard(body) {
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

  const systemPrompt = `You are a medical billing attorney drafting a formal dispute letter. Use ONLY the information provided — never add citations, codes, or facts not present in the analysis.

Write a formal dispute letter with exactly these 6 sections in order:

1. BACKGROUND
   Full header block: date, provider name and department, Re: line with account number, date of service, patient name, disputed amount. Then 2-3 sentences establishing the factual record.

2. BASIS FOR DISPUTE
   List EVERY specific error found in the analysis. For each:
   - Name the CPT code if present
   - State the billed amount
   - State specifically what is wrong (duplicate, upcoded, unbundled, balance billing, etc.)
   - If no CPT codes were found, base this section on the metadata provided and state that an itemized bill has not been received.

3. APPLICABLE BILLING STANDARDS AND REGULATIONS
   Cite ONLY the regulatory hooks returned in the analysis object. Do not add any not present. Include the full citation (e.g. "No Surprises Act, Public Law 116-260, 42 U.S.C. § 300gg-111") and one sentence on why it applies.

4. PROVIDER OBLIGATIONS
   State what the provider is specifically required to do under each cited regulation. Be concrete — not generic.

5. DEMAND
   State the specific resolution requested (use resolutionAsk from the request). Require written response within 10 business days. State that failure to respond will result in escalation to: state insurance commissioner, CMS, and state attorney general (include only escalation paths relevant to the regulatory hooks cited).

6. RESERVATION OF RIGHTS
   One paragraph. Reserve all rights including right to escalate, right to involve counsel, right to report to credit bureaus if collections are attempted during active dispute.

Close with Sincerely, then patient name on the next line.

RULES:
- Plain text only — no HTML, no markdown, no bullet points inside the letter
- Never use placeholder brackets — all values must be filled from the data provided
- Minimum 400 words — a letter under 400 words is not acceptable
- Never include attorney advice language in the letter body
- The letter must read as written by the patient personally, in first person
- The first line MUST be letterDate from the payload (Month DD, YYYY)
- Format dateOfService as Month DD, YYYY everywhere in the letter
- Never fabricate CPT/ICD codes; only reference codes from detectedErrors or specificCharges in the payload`;

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

  return letter.trim();
}

function previewFromLetter(letterText, analysis, maxLen = 1400) {
  const t = String(letterText || "").trim();
  if (!t) {
    return String(analysis?.summaryForUser || "Preview unavailable.").slice(0, maxLen);
  }
  if (t.length <= maxLen) return t;
  return (
    t.slice(0, maxLen).trim() +
    "\n\n[…]"
  );
}

module.exports = {
  generateMedicalBillLetterFromWizard,
  previewFromLetter,
  parseMoneyStr,
};
