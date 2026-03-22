// Security headers middleware
export function addSecurityHeaders(response) {
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com https://*.supabase.co; frame-src https://js.stripe.com;",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };

  return {
    ...response,
    headers: {
      ...response.headers,
      ...securityHeaders
    }
  };
}

export function validateOrigin(event) {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://Medical Bill Dispute Pro.com',
    'https://www.Medical Bill Dispute Pro.com',
    'https://Medical Bill Dispute Pro.netlify.app'
  ];
  
  const origin = event.headers.origin || event.headers.Origin;
  
  if (origin && !allowedOrigins.includes(origin)) {
    throw new Error('Invalid origin');
  }
  
  return true;
}

export function sanitizeResponse(data) {
  // Remove sensitive information from responses
  if (typeof data === 'object' && data !== null) {
    const sanitized = { ...data };
    
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.stripe_secret_key;
    delete sanitized.api_key;
    delete sanitized.token;
    
    return sanitized;
  }
  
  return data;
}
