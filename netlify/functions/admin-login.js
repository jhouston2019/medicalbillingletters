/**
 * Admin Login
 * Authenticates admin users and creates secure sessions
 */

import { getSupabaseAdmin } from "./_supabase.js";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function handler(event) {
  // Only allow POST
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

    // Get admin user
    const { data: adminUser, error: userError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .single();

    if (userError || !adminUser) {
      // Log failed attempt
      await supabase.from('admin_activity_log').insert({
        action: 'login_failed',
        resource_type: 'admin_auth',
        details: { email, reason: 'user_not_found' },
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip']
      });

      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, adminUser.password_hash);

    if (!passwordValid) {
      // Log failed attempt
      await supabase.from('admin_activity_log').insert({
        admin_user_id: adminUser.id,
        action: 'login_failed',
        resource_type: 'admin_auth',
        details: { email, reason: 'invalid_password' },
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip']
      });

      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create session
    const { error: sessionError } = await supabase
      .from('admin_sessions')
      .insert({
        admin_user_id: adminUser.id,
        session_token: sessionToken,
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'],
        user_agent: event.headers['user-agent'],
        expires_at: expiresAt.toISOString()
      });

    if (sessionError) {
      throw sessionError;
    }

    // Update last login
    await supabase
      .from('admin_users')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: adminUser.login_count + 1
      })
      .eq('id', adminUser.id);

    // Log successful login
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUser.id,
      action: 'login_success',
      resource_type: 'admin_auth',
      details: { email },
      ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip']
    });

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
