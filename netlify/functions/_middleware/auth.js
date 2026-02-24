/**
 * CENTRALIZED AUTHENTICATION MIDDLEWARE
 * 
 * Validates Supabase JWT on all protected endpoints
 * NO REPEATED AUTH LOGIC
 */

const { getSupabaseAdmin } = require("../_supabase");
const { authenticationError } = require("../_helpers/error-handler");
const { logSecurity } = require("../_helpers/logger");

/**
 * Extract JWT from Authorization header
 * @param {object} event - Netlify function event
 * @returns {string|null} - JWT token or null
 */
function extractToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader) {
    return null;
  }

  // Format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify Supabase JWT and get user
 * @param {string} token - JWT token
 * @returns {Promise<object>} - User object or null
 */
async function verifyToken(token) {
  if (!token) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logSecurity('invalid_token_attempt', { error: error?.message });
      return null;
    }

    return user;
  } catch (error) {
    logSecurity('token_verification_error', { error: error.message });
    return null;
  }
}

/**
 * Require authentication middleware
 * @param {object} event - Netlify function event
 * @returns {Promise<object>} - { user, error }
 */
async function requireAuth(event) {
  const token = extractToken(event);
  
  if (!token) {
    return {
      user: null,
      error: authenticationError('No authentication token provided')
    };
  }

  const user = await verifyToken(token);
  
  if (!user) {
    return {
      user: null,
      error: authenticationError('Invalid or expired authentication token')
    };
  }

  return {
    user,
    error: null
  };
}

/**
 * Optional authentication (doesn't fail if not authenticated)
 * @param {object} event - Netlify function event
 * @returns {Promise<object|null>} - User object or null
 */
async function optionalAuth(event) {
  const token = extractToken(event);
  
  if (!token) {
    return null;
  }

  return await verifyToken(token);
}

module.exports = {
  requireAuth,
  optionalAuth,
  extractToken,
  verifyToken
};
