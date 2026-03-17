/**
 * Admin Quality Metrics
 * Returns quality assessment data
 */

import { getSupabaseAdmin } from "./_supabase.js";

// Verify admin session
async function verifyAdminSession(token) {
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data: session, error } = await supabase
    .from('admin_sessions')
    .select('*, admin_users(*)')
    .eq('session_token', token)
    .single();

  if (error || !session) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  if (!session.admin_users.is_active) return null;

  return session.admin_users;
}

export async function handler(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  const adminUser = await verifyAdminSession(token);
  if (!adminUser) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get quality metrics
    const { data: metrics, error } = await supabase
      .from('quality_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    // Log access
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUser.id,
      action: 'view_quality_metrics',
      resource_type: 'quality_metrics',
      ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip']
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        metrics: metrics || []
      })
    };

  } catch (error) {
    console.error('Admin quality metrics error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
