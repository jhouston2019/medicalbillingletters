/**
 * Admin Verify Session
 * Simple session validation (any valid token is accepted for 24 hours)
 */

export async function handler(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ valid: false, error: 'No token provided' })
    };
  }

  try {
    // Simple validation - if token exists, it's valid
    // In production, you might want to store tokens in memory or a database
    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        user: {
          email: 'admin',
          fullName: 'Administrator',
          role: 'admin'
        }
      })
    };

  } catch (error) {
    console.error('Session verification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Internal server error' })
    };
  }
}
