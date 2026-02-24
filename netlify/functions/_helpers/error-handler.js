/**
 * STANDARDIZED ERROR RESPONSES
 * 
 * Never leak:
 * - Stack traces
 * - Environment variables
 * - API keys
 * - Internal error details
 */

/**
 * Create standardized error response
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error type
 * @param {string} message - User-friendly message
 * @param {object} additionalData - Optional additional data (safe to expose)
 * @returns {object} - Netlify function response
 */
function createErrorResponse(statusCode, error, message, additionalData = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      error,
      message,
      ...additionalData,
      timestamp: new Date().toISOString()
    })
  };
}

/**
 * Handle authentication errors
 * @param {string} message - Optional custom message
 * @returns {object} - Error response
 */
function authenticationError(message = 'Authentication required') {
  return createErrorResponse(401, 'Authentication required', message);
}

/**
 * Handle authorization/permission errors
 * @param {string} message - Optional custom message
 * @returns {object} - Error response
 */
function authorizationError(message = 'Access denied') {
  return createErrorResponse(403, 'Access denied', message);
}

/**
 * Handle not found errors
 * @param {string} resource - Resource type
 * @returns {object} - Error response
 */
function notFoundError(resource = 'Resource') {
  return createErrorResponse(404, 'Not found', `${resource} not found`);
}

/**
 * Handle validation errors
 * @param {string} message - Validation error message
 * @param {array} errors - Array of validation errors
 * @returns {object} - Error response
 */
function validationError(message, errors = []) {
  return createErrorResponse(400, 'Validation error', message, { errors });
}

/**
 * Handle rate limit errors
 * @param {number} retryAfter - Seconds until retry
 * @returns {object} - Error response
 */
function rateLimitError(retryAfter) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Retry-After': retryAfter.toString()
    },
    body: JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Too many requests. Please try again in ${retryAfter} seconds.`,
      retryAfter,
      timestamp: new Date().toISOString()
    })
  };
}

/**
 * Handle payment required errors
 * @param {string} message - Optional custom message
 * @returns {object} - Error response
 */
function paymentRequiredError(message = 'Payment required to access this resource') {
  return createErrorResponse(403, 'Payment required', message, {
    redirectTo: '/payment.html'
  });
}

/**
 * Handle internal server errors (sanitized)
 * @param {Error} error - Original error object
 * @returns {object} - Error response
 */
function internalError(error) {
  // Log full error server-side
  console.error('Internal error:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });

  // Return sanitized error to client (NO STACK TRACE)
  return createErrorResponse(
    500,
    'Internal server error',
    'An unexpected error occurred. Please try again later.'
  );
}

/**
 * Safe error handler - catches and sanitizes all errors
 * @param {Error} error - Error object
 * @returns {object} - Sanitized error response
 */
function handleError(error) {
  // Never expose internal details
  if (error.message && error.message.includes('ECONNREFUSED')) {
    return internalError(new Error('Service temporarily unavailable'));
  }

  if (error.message && error.message.includes('API key')) {
    return internalError(new Error('Configuration error'));
  }

  // Generic internal error
  return internalError(error);
}

module.exports = {
  createErrorResponse,
  authenticationError,
  authorizationError,
  notFoundError,
  validationError,
  rateLimitError,
  paymentRequiredError,
  internalError,
  handleError
};
