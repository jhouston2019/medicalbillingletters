import { getSupabaseAdmin } from './_supabase.js';
import bcrypt from 'bcryptjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email and password required' })
      };
    }

    const supabase = getSupabaseAdmin();

    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('id, email, password_hash, full_name, role, is_active')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !adminUser || !adminUser.is_active) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    const passwordMatch = await bcrypt.compare(password, adminUser.password_hash);
    if (!passwordMatch) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    const sessionToken = crypto.randomUUID() + '-' + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await supabase.from('admin_sessions').insert({
      admin_user_id: adminUser.id,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
      ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'],
      user_agent: event.headers['user-agent']
    });

    await supabase
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString(), login_count: adminUser.login_count + 1 })
      .eq('id', adminUser.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        user: {
          email: adminUser.email,
          fullName: adminUser.full_name,
          role: adminUser.role
        }
      })
    };

  } catch (error) {
    console.error('Admin login error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
