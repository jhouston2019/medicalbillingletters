/**
 * OWNERSHIP VERIFICATION HELPER
 * 
 * Ensures users can only access their own documents
 * NO EXCEPTIONS
 */

const { getSupabaseAdmin } = require("../_supabase");

/**
 * Verify document ownership
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID from auth
 * @returns {Promise<object>} - Verification result with document
 */
async function verifyOwnership(documentId, userId) {
  if (!documentId) {
    return {
      verified: false,
      error: 'Document ID is required',
      statusCode: 400
    };
  }

  if (!userId) {
    return {
      verified: false,
      error: 'User authentication required',
      statusCode: 401
    };
  }

  const supabase = getSupabaseAdmin();

  // Fetch document with ownership check
  const { data: document, error } = await supabase
    .from('claim_letters')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId) // CRITICAL: Ownership check
    .single();

  if (error) {
    console.error('Ownership verification error:', error);
    return {
      verified: false,
      error: 'Document not found or access denied',
      statusCode: 404
    };
  }

  if (!document) {
    return {
      verified: false,
      error: 'Document not found',
      statusCode: 404
    };
  }

  // Double-check ownership (defense in depth)
  if (document.user_id !== userId) {
    console.error('🚨 SECURITY ALERT: User', userId, 'attempted to access document owned by', document.user_id);
    return {
      verified: false,
      error: 'Access denied - you do not own this document',
      statusCode: 403
    };
  }

  return {
    verified: true,
    document: document
  };
}

/**
 * Verify ownership and return error response if failed
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} - Error response or null if verified
 */
async function verifyOwnershipOrFail(documentId, userId) {
  const verification = await verifyOwnership(documentId, userId);
  
  if (!verification.verified) {
    return {
      statusCode: verification.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: verification.error,
        message: 'You do not have permission to access this resource'
      })
    };
  }

  return null; // No error, ownership verified
}

module.exports = {
  verifyOwnership,
  verifyOwnershipOrFail
};
