import { getStore } from '@netlify/blobs';
import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/serverless';

// Initialize Sentry
Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production'
});

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'auto-claim-admin-secret-2024';

// Verify admin token
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No valid token provided');
  }
  
  const token = authHeader.substring(7);
  return jwt.verify(token, JWT_SECRET);
}

// Calculate statistics from user data
async function calculateStats() {
  const store = getStore({
    name: 'auto-claim-users',
    siteID: process.env.SITE_ID,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  
  const statsStore = getStore({
    name: 'auto-claim-stats',
    siteID: process.env.SITE_ID,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  
  // Get all users
  const { blobs } = await store.list();
  
  let totalRevenue = 0;
  let activeUsers = 0;
  let totalGenerations = 0;
  let totalCredits = 0;
  let claimTypes = {};
  let vehicleMakes = {};
  let states = {};
  let monthlyRevenue = {};
  let dailyGenerations = {};
  
  // Process each user
  for (const blob of blobs) {
    if (blob.key.startsWith('user_')) {
      const userData = await store.get(blob.key);
      const userJson = JSON.parse(await userData.text());
      
      // Count active users (those with activity in last 30 days)
      const lastActivity = userJson.generations?.[userJson.generations.length - 1]?.timestamp;
      if (lastActivity && new Date(lastActivity) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
        activeUsers++;
      }
      
      // Sum up purchases
      if (userJson.purchases) {
        userJson.purchases.forEach(purchase => {
          totalRevenue += purchase.amount || 0;
          
          // Track monthly revenue
          const month = new Date(purchase.date).toISOString().substring(0, 7);
          monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (purchase.amount || 0);
        });
      }
      
      // Count generations and analyze types
      if (userJson.generations) {
        totalGenerations += userJson.generations.length;
        
        userJson.generations.forEach(gen => {
          // Track claim types
          if (gen.claimType) {
            claimTypes[gen.claimType] = (claimTypes[gen.claimType] || 0) + 1;
          }
          
          // Track vehicle makes
          if (gen.vehicle) {
            const make = gen.vehicle.split(' ')[1]; // Extract make from "Year Make Model"
            if (make) {
              vehicleMakes[make] = (vehicleMakes[make] || 0) + 1;
            }
          }
          
          // Track daily generations
          const day = new Date(gen.timestamp).toISOString().substring(0, 10);
          dailyGenerations[day] = (dailyGenerations[day] || 0) + 1;
        });
      }
      
      // Count remaining credits
      totalCredits += userJson.credits || 0;
    }
  }
  
  // Calculate average claim value (example calculation)
  const avgClaimValue = totalGenerations > 0 ? Math.round(totalRevenue / totalGenerations * 10) : 0;
  
  // Get last 30 days revenue trend
  const last30Days = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    last30Days.push({
      date,
      revenue: Math.random() * 2000 + 500, // In production, get from Stripe
      generations: dailyGenerations[date] || 0
    });
  }
  
  // Store calculated stats for caching
  await statsStore.setJSON('latest_stats', {
    totalRevenue,
    activeUsers,
    totalGenerations,
    avgClaimValue,
    totalCredits,
    claimTypes,
    vehicleMakes,
    states,
    monthlyRevenue,
    last30Days,
    calculatedAt: new Date().toISOString()
  });
  
  return {
    totalRevenue,
    activeUsers,
    totalGenerations,
    avgClaimValue,
    totalCredits,
    claimTypes,
    vehicleMakes,
    states,
    monthlyRevenue,
    last30Days
  };
}

exports.handler = Sentry.AWSLambda.wrapHandler(async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': process.env.URL || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    // Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const decoded = verifyToken(authHeader);
    
    // Check permissions
    if (!decoded.permissions.includes('full_access') && 
        !decoded.permissions.includes('read_stats')) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Insufficient permissions' })
      };
    }
    
    // Get cached stats if recent
    const statsStore = getStore({
      name: 'auto-claim-stats',
      siteID: process.env.SITE_ID,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    
    const cachedStats = await statsStore.get('latest_stats');
    
    if (cachedStats) {
      const cached = JSON.parse(await cachedStats.text());
      const cacheAge = Date.now() - new Date(cached.calculatedAt).getTime();
      
      // Use cache if less than 5 minutes old
      if (cacheAge < 5 * 60 * 1000) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(cached)
        };
      }
    }
    
    // Calculate fresh stats
    const stats = await calculateStats();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(stats)
    };
    
  } catch (error) {
    Sentry.captureException(error);
    console.error('Stats error:', error);
    
    if (error.message === 'No valid token provided' || error.name === 'JsonWebTokenError') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authentication required' })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to retrieve statistics' })
    };
  }
});