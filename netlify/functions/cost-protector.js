/**
 * COST PROTECTION UTILITIES
 * 
 * Prevents OpenAI cost bombs by:
 * 1. Truncating input text
 * 2. Estimating token counts
 * 3. Rejecting oversized inputs
 */

const MAX_INPUT_CHARACTERS = 4000; // ~1000 tokens
const MAX_INPUT_TOKENS = 1500;
const MAX_OUTPUT_TOKENS = 2000;

/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for English text
 * @param {string} text - Input text
 * @returns {number} - Estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to safe length
 * @param {string} text - Input text
 * @param {number} maxChars - Maximum characters (default 4000)
 * @returns {string} - Truncated text
 */
function truncateText(text, maxChars = MAX_INPUT_CHARACTERS) {
  if (!text) return '';
  
  if (text.length <= maxChars) {
    return text;
  }

  // Truncate and add notice
  const truncated = text.substring(0, maxChars);
  return truncated + '\n\n[TEXT TRUNCATED FOR PROCESSING - Original length: ' + text.length + ' characters]';
}

/**
 * Validate input size before sending to OpenAI
 * @param {string} text - Input text
 * @returns {object} - Validation result
 */
function validateInputSize(text) {
  if (!text || text.trim().length === 0) {
    return {
      valid: false,
      error: 'No text provided'
    };
  }

  const characterCount = text.length;
  const estimatedTokens = estimateTokens(text);

  if (characterCount > MAX_INPUT_CHARACTERS * 3) {
    return {
      valid: false,
      error: `Input text too large (${characterCount} characters). Maximum allowed: ${MAX_INPUT_CHARACTERS * 3} characters.`,
      characterCount,
      estimatedTokens
    };
  }

  return {
    valid: true,
    characterCount,
    estimatedTokens,
    willTruncate: characterCount > MAX_INPUT_CHARACTERS
  };
}

/**
 * Prepare text for OpenAI with cost protection
 * @param {string} text - Raw input text
 * @returns {object} - Prepared text and metadata
 */
function prepareForOpenAI(text) {
  const validation = validateInputSize(text);
  
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const processedText = truncateText(text, MAX_INPUT_CHARACTERS);
  const finalTokens = estimateTokens(processedText);

  return {
    text: processedText,
    originalLength: text.length,
    processedLength: processedText.length,
    truncated: validation.willTruncate,
    estimatedInputTokens: finalTokens,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    estimatedCost: calculateEstimatedCost(finalTokens, MAX_OUTPUT_TOKENS)
  };
}

/**
 * Calculate estimated OpenAI cost
 * GPT-4o-mini pricing: $0.150 per 1M input tokens, $0.600 per 1M output tokens
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} outputTokens - Expected output tokens
 * @returns {number} - Estimated cost in USD
 */
function calculateEstimatedCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1000000) * 0.150;
  const outputCost = (outputTokens / 1000000) * 0.600;
  return inputCost + outputCost;
}

/**
 * Get safe OpenAI parameters
 * @returns {object} - Safe parameters for OpenAI call
 */
function getSafeOpenAIParams() {
  return {
    temperature: 0.3,
    max_tokens: MAX_OUTPUT_TOKENS,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  };
}

/**
 * Extract smart summary from large text
 * Takes beginning, middle, and end sections
 * @param {string} text - Large text
 * @param {number} targetLength - Target character length
 * @returns {string} - Smart summary
 */
function smartExtract(text, targetLength = MAX_INPUT_CHARACTERS) {
  if (text.length <= targetLength) {
    return text;
  }

  const sectionSize = Math.floor(targetLength / 3);
  
  const beginning = text.substring(0, sectionSize);
  const middleStart = Math.floor((text.length - sectionSize) / 2);
  const middle = text.substring(middleStart, middleStart + sectionSize);
  const end = text.substring(text.length - sectionSize);

  return `${beginning}\n\n[... MIDDLE SECTION ...]\n\n${middle}\n\n[... END SECTION ...]\n\n${end}`;
}

module.exports = {
  estimateTokens,
  truncateText,
  validateInputSize,
  prepareForOpenAI,
  calculateEstimatedCost,
  getSafeOpenAIParams,
  smartExtract,
  MAX_INPUT_CHARACTERS,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS
};
