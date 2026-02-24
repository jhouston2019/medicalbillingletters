/**
 * STRUCTURED LOGGING
 * 
 * Replace console.log with structured events
 */

/**
 * Log info event
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function logInfo(event, data = {}) {
  console.info(JSON.stringify({
    level: 'info',
    event,
    ...data,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Log error event
 * @param {string} event - Event name
 * @param {Error|string} error - Error object or message
 * @param {object} data - Additional data
 */
function logError(event, error, data = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    error: error instanceof Error ? error.message : error,
    ...data,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Log warning event
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function logWarn(event, data = {}) {
  console.warn(JSON.stringify({
    level: 'warn',
    event,
    ...data,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Log security event
 * @param {string} event - Security event name
 * @param {object} data - Event data
 */
function logSecurity(event, data = {}) {
  console.warn(JSON.stringify({
    level: 'security',
    event,
    ...data,
    timestamp: new Date().toISOString()
  }));
}

module.exports = {
  logInfo,
  logError,
  logWarn,
  logSecurity
};
