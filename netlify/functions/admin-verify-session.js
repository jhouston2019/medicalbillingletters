/**
 * Admin Verify Session
 * Validates admin session tokens
 */

import { getSupabaseAdmin } from "./_supabase.js";

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
    const supabase = getSupabaseAdmin();

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('admin_sessions')
      .select('*, admin_users(*)')
      .eq('session_token', token)
      .single();

    if (sessionError || !session) {
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, error: 'Invalid session' })
      };
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      // Delete expired session
      await supabase
        .from('admin_sessions')
        .delete()
        .eq('session_token', token);

      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, error: 'Session expired' })
      };
    }

    // Check if user is active
    if (!session.admin_users.is_active) {
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, error: 'User inactive' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        user: {
          id: session.admin_users.id,
          email: session.admin_users.email,
          fullName: session.admin_users.full_name,
          role: session.admin_users.role
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
