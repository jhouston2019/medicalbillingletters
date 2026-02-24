/**
 * OUTPUT SANITIZATION
 * 
 * Prevent XSS in generated content
 */

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;'
  };
  
  return text.replace(/[&<>"'\/]/g, char => map[char]);
}

/**
 * Strip all HTML tags
 * @param {string} text - Text with potential HTML
 * @returns {string} - Plain text
 */
function stripHtml(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Remove script tags and inline event handlers
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function removeScripts(text) {
  if (!text) return '';
  
  let sanitized = text;
  
  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove inline event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  return sanitized;
}

/**
 * Sanitize user input for display
 * @param {string} text - User input
 * @returns {string} - Sanitized text
 */
function sanitizeForDisplay(text) {
  if (!text) return '';
  
  // Remove scripts first
  let sanitized = removeScripts(text);
  
  // Escape HTML
  sanitized = escapeHtml(sanitized);
  
  return sanitized;
}

/**
 * Sanitize generated letter content
 * @param {string} letter - Generated letter
 * @returns {string} - Sanitized letter
 */
function sanitizeLetter(letter) {
  if (!letter) return '';
  
  // Remove any script tags or dangerous content
  let sanitized = removeScripts(letter);
  
  // Keep basic formatting but escape dangerous characters
  return sanitized;
}

/**
 * Sanitize for PDF generation
 * @param {string} text - Text for PDF
 * @returns {string} - Sanitized text
 */
function sanitizeForPdf(text) {
  if (!text) return '';
  
  // Strip all HTML tags
  let sanitized = stripHtml(text);
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  
  return sanitized;
}

module.exports = {
  escapeHtml,
  stripHtml,
  removeScripts,
  sanitizeForDisplay,
  sanitizeLetter,
  sanitizeForPdf
};
