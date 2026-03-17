/**
 * Admin Logout
 * Invalidates admin session tokens
 */

import { getSupabaseAdmin } from "./_supabase.js";

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get session to log activity
    const { data: session } = await supabase
      .from('admin_sessions')
      .select('admin_user_id')
      .eq('session_token', token)
      .single();

    // Delete session
    await supabase
      .from('admin_sessions')
      .delete()
      .eq('session_token', token);

    // Log logout
    if (session) {
      await supabase.from('admin_activity_log').insert({
        admin_user_id: session.admin_user_id,
        action: 'logout',
        resource_type: 'admin_auth',
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip']
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Logout error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
