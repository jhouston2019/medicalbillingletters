/**
 * Shared GPT letter generation for medical bill wizard (plain text dispute letter).
 */

const OpenAI = require("openai");
const { buildLetterSystemPrompt } = require("./_letterSystemPrompt");

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

  const stateLabel =
    patientState && String(patientState).trim() ? String(patientState).trim() : "[Your State]";

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
    patientState: stateLabel,
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
      { role: "system", content: buildLetterSystemPrompt(patientState) },
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
  return t.slice(0, maxLen).trim() + "\n\n[…]";
}

module.exports = {
  generateMedicalBillLetterFromWizard,
  previewFromLetter,
  parseMoneyStr,
};
