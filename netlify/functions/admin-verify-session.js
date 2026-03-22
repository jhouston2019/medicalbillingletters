import { getSupabaseAdmin } from './_supabase.js';

export async function handler(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ valid: false, error: 'No token provided' })
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from('admin_sessions')
      .select('id, expires_at, admin_user_id, admin_users(email, full_name, role, is_active)')
      .eq('session_token', token)
      .single();

    if (error || !session) {
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, error: 'Invalid session' })
      };
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('admin_sessions').delete().eq('session_token', token);
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, error: 'Session expired' })
      };
    }

    const adminUser = session.admin_users;
    if (!adminUser || !adminUser.is_active) {
      return {
        statusCode: 401,
        body: JSON.stringify({ valid: false, error: 'Account inactive' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        user: {
          email: adminUser.email,
          fullName: adminUser.full_name,
          role: adminUser.role
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
