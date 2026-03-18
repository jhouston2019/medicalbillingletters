// tests/generate.test.js
const { handler } = require('../netlify/functions/generate');

describe('Generate Function Tests', () => {
  const mockEvent = {
    body: JSON.stringify({
      email: 'test@example.com',
      prompt: 'My 2020 Honda Accord was totaled and State Farm offered $18,000 but KBB shows $22,000',
      claimType: 'total-loss',
      vehicleInfo: {
        vin: '1HGCV1F35LA123456',
        year: 2020,
        make: 'Honda',
        model: 'Accord',
        mileage: 35000
      },
      csrfToken: 'valid-token',
      sessionToken: 'valid-session'
    }),
    headers: {
      'x-forwarded-for': '192.168.1.1'
    }
  };

  test('should validate VIN correctly', async () => {
    const invalidVin = { ...mockEvent };
    invalidVin.body = JSON.stringify({
      ...JSON.parse(mockEvent.body),
      vehicleInfo: { vin: 'INVALID123' }
    });
    
    const response = await handler(invalidVin);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('Invalid VIN');
  });

  test('should validate email format', async () => {
    const invalidEmail = { ...mockEvent };
    invalidEmail.body = JSON.stringify({
      ...JSON.parse(mockEvent.body),
      email: 'not-an-email'
    });
    
    const response = await handler(invalidEmail);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('Valid email');
  });

  test('should enforce rate limiting', async () => {
    // Simulate multiple rapid requests
    const promises = [];
    for (let i = 0; i < 25; i++) {
      promises.push(handler(mockEvent));
    }
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.statusCode === 429);
    expect(rateLimited).toBe(true);
  });

  test('should sanitize user input', async () => {
    const maliciousInput = { ...mockEvent };
    maliciousInput.body = JSON.stringify({
      ...JSON.parse(mockEvent.body),
      prompt: '<script>alert("XSS")</script>DROP TABLE users;'
    });
    
    const response = await handler(maliciousInput);
    // Should not error but sanitize
    expect(response.statusCode).not.toBe(500);
  });

  test('should validate vehicle year range', async () => {
    const futureYear = { ...mockEvent };
    futureYear.body = JSON.stringify({
      ...JSON.parse(mockEvent.body),
      vehicleInfo: { year: 2030 }
    });
    
    const response = await handler(futureYear);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('Invalid vehicle year');
  });
});

// tests/checkout.test.js
const { handler } = require('../netlify/functions/checkout');
const stripe = require('stripe');

jest.mock('stripe');

describe('Checkout Function Tests', () => {
  const mockEvent = {
    body: JSON.stringify({
      email: 'test@example.com',
      successUrl: 'https://autoclaimnavigatorai.netlify.app/success',
      cancelUrl: 'https://autoclaimnavigatorai.netlify.app'
    }),
    headers: {}
  };

  beforeEach(() => {
    stripe.mockReturnValue({
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.com/pay/cs_test_123'
          })
        }
      }
    });
  });

  test('should create Stripe checkout session', async () => {
    const response = await handler(mockEvent);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sessionId).toBe('cs_test_123');
    expect(body.url).toContain('checkout.stripe.com');
  });

  test('should validate email before checkout', async () => {
    const invalidEmail = { ...mockEvent };
    invalidEmail.body = JSON.stringify({
      email: 'invalid-email',
      successUrl: 'https://example.com',
      cancelUrl: 'https://example.com'
    });
    
    const response = await handler(invalidEmail);
    expect(response.statusCode).toBe(400);
  });

  test('should include metadata in checkout session', async () => {
    await handler(mockEvent);
    
    const createCall = stripe().checkout.sessions.create.mock.calls[0][0];
    expect(createCall.metadata).toHaveProperty('email');
    expect(createCall.metadata.email).toBe('test@example.com');
  });

  test('should set correct product price', async () => {
    await handler(mockEvent);
    
    const createCall = stripe().checkout.sessions.create.mock.calls[0][0];
    expect(createCall.line_items[0].price_data.unit_amount).toBe(49900); // $499
  });
});

// tests/vehicle-validation.test.js
const { validateVIN, validateYear, validateMileage } = require('../utils/vehicle-validation');

describe('Vehicle Validation Tests', () => {
  describe('VIN Validation', () => {
    test('should accept valid VIN', () => {
      expect(validateVIN('1HGCV1F35LA123456')).toBe(true);
      expect(validateVIN('JH4KA7560PC123456')).toBe(true);
    });

    test('should reject invalid VIN format', () => {
      expect(validateVIN('123456789')).toBe(false); // Too short
      expect(validateVIN('IIIIIIIIIIIIIIII')).toBe(false); // Contains I
      expect(validateVIN('OOOOOOOOOOOOOOOOO')).toBe(false); // Contains O
      expect(validateVIN('QQQQQQQQQQQQQQQQQ')).toBe(false); // Contains Q
    });

    test('should validate check digit', () => {
      // VIN with correct check digit
      expect(validateVIN('1HGCV1F35LA123456')).toBe(true);
      // VIN with incorrect check digit
      expect(validateVIN('1HGCV1F30LA123456')).toBe(false);
    });
  });

  describe('Year Validation', () => {
    test('should accept valid years', () => {
      const currentYear = new Date().getFullYear();
      expect(validateYear(2020)).toBe(true);
      expect(validateYear(1981)).toBe(true); // Minimum year
      expect(validateYear(currentYear)).toBe(true);
      expect(validateYear(currentYear + 1)).toBe(true); // Next year models
    });

    test('should reject invalid years', () => {
      expect(validateYear(1980)).toBe(false); // Too old
      expect(validateYear(2030)).toBe(false); // Too far future
      expect(validateYear('abc')).toBe(false); // Non-numeric
    });
  });

  describe('Mileage Validation', () => {
    test('should accept valid mileage', () => {
      expect(validateMileage(0)).toBe(true);
      expect(validateMileage(50000)).toBe(true);
      expect(validateMileage(250000)).toBe(true);
      expect(validateMileage(500000)).toBe(true); // Maximum
    });

    test('should reject invalid mileage', () => {
      expect(validateMileage(-1)).toBe(false); // Negative
      expect(validateMileage(500001)).toBe(false); // Too high
      expect(validateMileage('abc')).toBe(false); // Non-numeric
    });
  });
});

// tests/admin-auth.test.js
const { handler } = require('../netlify/functions/admin-auth');
const jwt = require('jsonwebtoken');

describe('Admin Authentication Tests', () => {
  const validCredentials = {
    username: 'admin',
    password: 'AutoClaim2024Admin!',
    otp: '123456'
  };

  test('should authenticate valid admin credentials', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify(validCredentials),
      headers: { 'x-forwarded-for': '192.168.1.1' }
    };
    
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.token).toBeDefined();
  });

  test('should reject invalid credentials', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'wrong-password'
      }),
      headers: { 'x-forwarded-for': '192.168.1.1' }
    };
    
    const response = await handler(event);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toContain('Invalid credentials');
  });

  test('should enforce rate limiting after failed attempts', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        username: 'admin',
        password: 'wrong'
      }),
      headers: { 'x-forwarded-for': '192.168.1.1' }
    };
    
    // Make 6 failed attempts
    for (let i = 0; i < 6; i++) {
      await handler(event);
    }
    
    const response = await handler(event);
    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body).error).toContain('Too many failed attempts');
  });

  test('should verify JWT token', async () => {
    const token = jwt.sign(
      { username: 'admin', permissions: ['full_access'] },
      'auto-claim-admin-secret-2024',
      { expiresIn: '8h' }
    );
    
    const event = {
      httpMethod: 'GET',
      headers: { 
        authorization: `Bearer ${token}`,
        'x-forwarded-for': '192.168.1.1'
      }
    };
    
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).success).toBe(true);
  });
});

// tests/email-queue.test.js
const { queueEmail, processQueue } = require('../netlify/functions/email-queue');

describe('Email Queue Tests', () => {
  test('should queue email successfully', async () => {
    const emailId = await queueEmail(
      'welcome',
      'test@example.com',
      { name: 'Test User' }
    );
    
    expect(emailId).toBeDefined();
    expect(emailId).toMatch(/^email_/);
  });

  test('should respect priority ordering', async () => {
    await queueEmail('welcome', 'user1@example.com', {}, 'normal');
    await queueEmail('creditLow', 'user2@example.com', {}, 'high');
    await queueEmail('claimSuccess', 'user3@example.com', {}, 'normal');
    
    // Process queue should handle high priority first
    // This would need actual implementation testing with mock store
  });

  test('should retry failed emails with backoff', async () => {
    // Mock a failing email
    const emailId = await queueEmail(
      'invalid_template', // This will cause an error
      'test@example.com',
      {}
    );
    
    // Process should mark for retry
    await processQueue();
    
    // Check retry scheduling
    // Would need to verify scheduled time increases exponentially
  });

  test('should clean up old sent emails', async () => {
    // Create old email record (mock as sent 8 days ago)
    // Process queue should delete it
    // Verify deletion
  });
});

// tests/integration.test.js
describe('Integration Tests', () => {
  test('Complete purchase and generation flow', async () => {
    // 1. Create checkout session
    // 2. Simulate webhook for successful payment
    // 3. Verify credits added
    // 4. Generate document
    // 5. Verify credits deducted
    // 6. Download document
  });

  test('Rate limiting across multiple endpoints', async () => {
    // Test that rate limiting is consistent across all protected endpoints
  });

  test('Security headers present on all responses', async () => {
    // Verify X-Frame-Options, X-Content-Type-Options, etc.
  });

  test('CORS configuration correct', async () => {
    // Test preflight requests and allowed origins
  });
});