import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as Sentry from '@sentry/serverless';
import speakeasy from 'speakeasy';

// Initialize Sentry
Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production'
});

// Admin credentials (in production, store in secure database)
const ADMIN_USERS = {
  'admin': {
    // Password: AutoClaim2024Admin!
    passwordHash: '$2a$10$YourHashedPasswordHere',
    totpSecret: process.env.ADMIN_TOTP_SECRET,
    permissions: ['full_access']
  },
  'support': {
    // Password: SupportTeam2024!
    passwordHash: '$2a$10$YourHashedPasswordHere',
    totpSecret: process.env.SUPPORT_TOTP_SECRET,
    permissions: ['read_users', 'read_purchases', 'add_credits']
  }
};

// JWT secret
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'auto-claim-admin-secret-2024';

// Rate limiting for login attempts
const loginAttempts = new Map();

function checkRateLimit(username, ip) {
  const key = `${username}_${ip}`;
  const attempts = loginAttempts.get(key) || { count: 0, resetTime: Date.now() + 900000 };
  
  if (Date.now() > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = Date.now() + 900000; // 15 minutes
  }
  
  if (attempts.count >= 5) {
    const waitTime = Math.ceil((attempts.resetTime - Date.now()) / 1000 / 60);
    throw new Error(`Too many failed attempts. Try again in ${waitTime} minutes.`);
  }
  
  attempts.count++;
  loginAttempts.set(key, attempts);
  
  return attempts.count;
}

function clearRateLimit(username, ip) {
  const key = `${username}_${ip}`;
  loginAttempts.delete(key);
}

exports.handler = Sentry.AWSLambda.wrapHandler(async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Access-Control-Allow-Origin': process.env.URL || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';

    // GET request - verify token
    if (event.httpMethod === 'GET') {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'No token provided' })
        };
      }
      
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            username: decoded.username,
            permissions: decoded.permissions 
          })
        };
      } catch (error) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid token' })
        };
      }
    }
    
    // POST request - login
    if (event.httpMethod === 'POST') {
      const { username, password, otp } = JSON.parse(event.body);
      
      // Validate input
      if (!username || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Username and password required' })
        };
      }
      
      // Check rate limiting
      try {
        checkRateLimit(username, clientIp);
      } catch (rateLimitError) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ error: rateLimitError.message })
        };
      }
      
      // Verify user exists
      const user = ADMIN_USERS[username];
      if (!user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid credentials' })
        };
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid credentials' })
        };
      }
      
      // Verify 2FA if enabled
      if (user.totpSecret && otp) {
        const verified = speakeasy.totp.verify({
          secret: user.totpSecret,
          encoding: 'base32',
          token: otp,
          window: 2
        });
        
        if (!verified) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Invalid 2FA code' })
          };
        }
      }
      
      // Clear rate limit on successful login
      clearRateLimit(username, clientIp);
      
      // Generate JWT
      const token = jwt.sign(
        {
          username,
          permissions: user.permissions,
          ip: clientIp
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      );
      
      // Log successful login
      console.log(`Admin login: ${username} from ${clientIp}`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          token,
          expiresIn: 28800 // 8 hours in seconds
        })
      };
    }
    
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
    
  } catch (error) {
    Sentry.captureException(error);
    console.error('Admin auth error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Authentication service error' })
    };
  }
});