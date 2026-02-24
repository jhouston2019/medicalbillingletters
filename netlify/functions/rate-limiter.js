/**
 * RATE LIMITING MIDDLEWARE
 * 
 * Prevents abuse by limiting requests per IP/user
 */

const rateLimit = new Map();

const RATE_LIMITS = {
  upload: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  analyze: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour
  generate: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  default: { maxRequests: 100, windowMs: 60 * 60 * 1000 } // 100 per hour
};

function getRateLimitKey(ip, userId, action) {
  // Combine both IP and userId for stronger rate limiting
  // This prevents bypass via VPN rotation OR new account creation
  if (userId && ip) {
    return `${action}:user:${userId}:ip:${ip}`;
  } else if (userId) {
    return `${action}:user:${userId}`;
  } else {
    return `${action}:ip:${ip}`;
  }
}

function checkRateLimit(key, limit) {
  const now = Date.now();
  const record = rateLimit.get(key) || { count: 0, resetTime: now + limit.windowMs };

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + limit.windowMs;
  }

  if (record.count >= limit.maxRequests) {
    console.warn(`Rate limit exceeded for key: ${key}`);
    return {
      allowed: false,
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
      remaining: 0
    };
  }

  record.count++;
  rateLimit.set(key, record);

  return {
    allowed: true,
    remaining: limit.maxRequests - record.count,
    resetTime: record.resetTime
  };
}

function getRateLimitForAction(action) {
  return RATE_LIMITS[action] || RATE_LIMITS.default;
}

module.exports = {
  checkRateLimit,
  getRateLimitKey,
  getRateLimitForAction
};
