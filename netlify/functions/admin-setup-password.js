/**
 * Admin Setup Password
 * One-time setup to create initial admin user with hashed password
 * Should be called once during deployment, then disabled
 */

import { getSupabaseAdmin } from "./_supabase.js";
import bcrypt from 'bcryptjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { setupKey, email, password, fullName } = JSON.parse(event.body);

    // Verify setup key (from environment variable)
    const SETUP_KEY = process.env.ADMIN_SETUP_KEY;
    if (!SETUP_KEY || setupKey !== SETUP_KEY) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Invalid setup key' })
      };
    }

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email and password required' })
      };
    }

    // Password requirements
    if (password.length < 12) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Password must be at least 12 characters' })
      };
    }

    const supabase = getSupabaseAdmin();

    // Check if admin already exists
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Admin user already exists' })
      };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const { data: adminUser, error: insertError } = await supabase
      .from('admin_users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        full_name: fullName || 'Administrator',
        role: 'super_admin',
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Log creation
    await supabase.from('admin_activity_log').insert({
      admin_user_id: adminUser.id,
      action: 'admin_created',
      resource_type: 'admin_users',
      details: { email: adminUser.email },
      ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip']
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Admin user created successfully',
        email: adminUser.email
      })
    };

  } catch (error) {
    console.error('Admin setup error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
