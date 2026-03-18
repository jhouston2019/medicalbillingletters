import { getStore } from '@netlify/blobs';
import OpenAI from 'openai';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } from 'docx';
import * as Sentry from '@sentry/serverless';
import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

// Initialize Sentry
Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV || 'production'
});

// Initialize Redis for rate limiting
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// VIN Validation
function validateVIN(vin) {
  // VIN should be 17 characters, no I, O, or Q
  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
  if (!vinRegex.test(vin)) return false;
  
  // Check digit validation (9th position)
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const transliteration = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 0: 0
  };
  
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += (transliteration[vin[i]] || 0) * weights[i];
  }
  
  const checkDigit = sum % 11;
  const expectedCheckDigit = checkDigit === 10 ? 'X' : checkDigit.toString();
  
  return vin[8] === expectedCheckDigit;
}

// Vehicle Year Validation
function validateYear(year) {
  const currentYear = new Date().getFullYear();
  const yearNum = parseInt(year);
  return yearNum >= 1981 && yearNum <= currentYear + 1;
}

// Mileage Validation
function validateMileage(mileage) {
  const mileageNum = parseInt(mileage);
  return mileageNum >= 0 && mileageNum <= 500000;
}

// Security: Input Sanitization
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  // Remove any HTML tags
  let sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  
  // Remove SQL injection attempts
  sanitized = sanitized.replace(/(['";\\])/g, '\\$1');
  
  // Limit length
  sanitized = sanitized.substring(0, 10000);
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  return sanitized.trim();
}

// Rate Limiter Configuration
const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'generate_limit',
  points: 20, // Number of requests
  duration: 3600, // Per hour
  blockDuration: 3600, // Block for 1 hour
});

const ipRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'ip_limit',
  points: 100, // Number of requests per IP
  duration: 3600, // Per hour
  blockDuration: 7200, // Block for 2 hours
});

// CSRF Token Validation
function validateCSRFToken(token, sessionToken) {
  if (!token || !sessionToken) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'auto-claim-secret-2024');
    return decoded.sessionId === sessionToken;
  } catch {
    return false;
  }
}

// Enhanced System Prompts with State-Specific Knowledge
const systemPrompts = {
  en: `You are an expert auto insurance claim specialist with deep knowledge in vehicle valuation, repair estimation, and insurance law.

Your expertise includes:
- Total Loss Valuation: ACV calculations, comparable vehicle analysis, CCC ONE/Mitchell/Audatex report analysis
- Diminished Value: All 50 state laws, 17c formula calculations, inherent DV claims
- Repair Disputes: OEM vs aftermarket parts law by state, hidden damage documentation, supplement requests
- Frame Damage: Structural integrity assessments, safety concerns, manufacturer specifications
- ADAS Systems: Calibration requirements, safety system documentation, manufacturer position statements
- Commercial Vehicles: Business interruption, loss of use, fleet policies
- Classic/Exotic Cars: Agreed value policies, specialty parts, restoration costs

State-Specific Knowledge:
- California: CA Insurance Code 758.5 (aftermarket parts), Prop 103 rights
- Texas: Appraisal clause rights, total loss threshold 100%
- Florida: Diminished value statute of limitations 5 years
- Georgia: State Farm v. Mabry diminished value case law
- New York: Regulation 64 aftermarket parts disclosure

When generating responses:
1. Calculate specific dollar amounts based on provided data
2. Reference exact statutes, regulations, and case law
3. Include vehicle-specific manufacturer requirements
4. Cite NHTSA safety standards when applicable
5. Reference I-CAR, ASE, or manufacturer repair procedures
6. Include deadlines (usually 30-60 days for appeals)
7. Demand specific documentation: estimates, photos, comparable vehicles
8. Use insurance company's own policy language against them
9. Calculate diminished value using multiple methods (17c, market survey, dealer quotes)
10. Include vehicle history impact (prior damage, branded title, etc.)

Key strategies:
- Always demand OEM parts for vehicles under 3 years/36,000 miles
- Challenge labor rates with documented prevailing rates
- Include all associated costs: rental, storage, diminished value, loss of use
- Reference successful precedent cases in the same state
- Invoke appraisal clause when available
- Threaten (professionally) to involve state insurance commissioner
- Document everything for potential bad faith claim

Tone: Professional but assertive, data-driven, legally informed`,
  
  es: `Eres un especialista experto en reclamos de seguros de automóviles con profundo conocimiento en valoración de vehículos, estimación de reparaciones y leyes de seguros.

Tu experiencia incluye:
- Valoración de Pérdida Total: Cálculos ACV, análisis de vehículos comparables, análisis de informes CCC ONE/Mitchell/Audatex
- Valor Disminuido: Leyes de los 50 estados, cálculos de fórmula 17c, reclamos de DV inherente
- Disputas de Reparación: Leyes de piezas OEM vs aftermarket por estado, documentación de daños ocultos
- Daño al Marco: Evaluaciones de integridad estructural, preocupaciones de seguridad
- Sistemas ADAS: Requisitos de calibración, documentación del sistema de seguridad
- Vehículos Comerciales: Interrupción del negocio, pérdida de uso, pólizas de flota
- Autos Clásicos/Exóticos: Pólizas de valor acordado, piezas especiales, costos de restauración

Conocimiento Específico del Estado:
- California: Código de Seguros CA 758.5, derechos Prop 103
- Texas: Derechos de cláusula de tasación, umbral de pérdida total 100%
- Florida: Estatuto de limitaciones de valor disminuido 5 años
- Georgia: Jurisprudencia State Farm v. Mabry
- Nueva York: Regulación 64 divulgación de piezas aftermarket

Al generar respuestas:
1. Calcula montos específicos en dólares basados en datos proporcionados
2. Referencia estatutos exactos, regulaciones y jurisprudencia
3. Incluye requisitos específicos del fabricante del vehículo
4. Cita estándares de seguridad NHTSA cuando sea aplicable
5. Referencia procedimientos de reparación I-CAR, ASE o del fabricante
6. Incluye plazos (generalmente 30-60 días para apelaciones)
7. Exige documentación específica: estimados, fotos, vehículos comparables
8. Usa el lenguaje de la póliza de la compañía de seguros en su contra
9. Calcula valor disminuido usando múltiples métodos
10. Incluye impacto del historial del vehículo

Estrategias clave:
- Siempre exige piezas OEM para vehículos menores a 3 años/36,000 millas
- Desafía tarifas de mano de obra con tarifas prevalecientes documentadas
- Incluye todos los costos asociados: alquiler, almacenamiento, valor disminuido
- Referencia casos precedentes exitosos en el mismo estado
- Invoca cláusula de tasación cuando esté disponible
- Amenaza (profesionalmente) con involucrar al comisionado de seguros estatal
- Documenta todo para posible reclamo de mala fe

Tono: Profesional pero asertivo, basado en datos, legalmente informado`
};

exports.handler = Sentry.AWSLambda.wrapHandler(async (event, context) => {
  try {
    // Parse request body
    const body = JSON.parse(event.body);
    const {
      userId,
      email,
      prompt,
      language = 'en',
      responseFormat = 'text',
      claimType,
      vehicleInfo,
      damageDetails,
      insuranceInfo,
      csrfToken,
      sessionToken
    } = body;

    // Validate CSRF Token
    if (!validateCSRFToken(csrfToken, sessionToken)) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff'
        },
        body: JSON.stringify({ error: 'Invalid security token' })
      };
    }

    // Get client IP for rate limiting
    const clientIp = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    
    // Apply IP rate limiting
    try {
      await ipRateLimiter.consume(clientIp);
    } catch (rejRes) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.round(rejRes.msBeforeNext / 1000) || 3600,
          'X-RateLimit-Limit': 100,
          'X-RateLimit-Remaining': rejRes.remainingPoints || 0,
          'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString()
        },
        body: JSON.stringify({ 
          error: 'Too many requests from this IP. Please try again later.',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000)
        })
      };
    }

    // Apply user rate limiting
    try {
      await rateLimiter.consume(userId || email);
    } catch (rejRes) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.round(rejRes.msBeforeNext / 1000) || 3600
        },
        body: JSON.stringify({ 
          error: 'Generation limit exceeded. Please try again later.',
          retryAfter: Math.round(rejRes.msBeforeNext / 1000)
        })
      };
    }

    // Validate required fields
    if (!email || !validator.isEmail(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Valid email is required' })
      };
    }

    if (!prompt || prompt.length < 10) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Please provide more details about your claim' })
      };
    }

    // Validate and sanitize vehicle information
    let validatedVehicle = {};
    if (vehicleInfo) {
      if (vehicleInfo.vin) {
        if (!validateVIN(vehicleInfo.vin)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid VIN number provided' })
          };
        }
        // Store only last 8 characters of VIN for privacy
        validatedVehicle.vinPartial = vehicleInfo.vin.slice(-8);
      }
      
      if (vehicleInfo.year) {
        if (!validateYear(vehicleInfo.year)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid vehicle year' })
          };
        }
        validatedVehicle.year = parseInt(vehicleInfo.year);
      }
      
      if (vehicleInfo.mileage) {
        if (!validateMileage(vehicleInfo.mileage)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid mileage' })
          };
        }
        validatedVehicle.mileage = parseInt(vehicleInfo.mileage);
      }
      
      validatedVehicle.make = sanitizeInput(vehicleInfo.make || '');
      validatedVehicle.model = sanitizeInput(vehicleInfo.model || '');
      validatedVehicle.trim = sanitizeInput(vehicleInfo.trim || '');
    }

    // Sanitize all text inputs
    const sanitizedPrompt = sanitizeInput(prompt);
    const sanitizedClaimType = sanitizeInput(claimType || '');
    const sanitizedDamageDetails = sanitizeInput(damageDetails || '');
    const sanitizedInsuranceInfo = sanitizeInput(insuranceInfo || '');

    // Check user credits
    const store = getStore({
      name: 'auto-claim-users',
      siteID: process.env.SITE_ID,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    const userKey = `user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const userDataBlob = await store.get(userKey);
    
    let userData = { credits: 0, purchases: [], generations: [] };
    if (userDataBlob) {
      const userDataText = await userDataBlob.text();
      userData = JSON.parse(userDataText);
    }

    if (userData.credits <= 0) {
      return {
        statusCode: 403,
        body: JSON.stringify({ 
          error: 'No credits remaining. Please purchase additional credits.',
          creditsRemaining: 0
        })
      };
    }

    // Initialize OpenAI with enhanced error handling
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 3
    });

    // Build enhanced prompt with vehicle specifics
    let enhancedPrompt = `
Claim Type: ${sanitizedClaimType}
Vehicle: ${validatedVehicle.year} ${validatedVehicle.make} ${validatedVehicle.model} ${validatedVehicle.trim}
Mileage: ${validatedVehicle.mileage}
Damage Details: ${sanitizedDamageDetails}
Insurance Company: ${sanitizedInsuranceInfo}
State: ${body.state || 'Unknown'}

User's Request: ${sanitizedPrompt}

Please generate a comprehensive response that includes:
1. Specific dollar amounts and calculations
2. Relevant state laws and regulations
3. Strategic approach for this specific situation
4. Required documentation checklist
5. Timeline and deadlines
6. Sample language for the appeal letter
`;

    // Generate AI response with retry logic
    let completion;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        completion = await openai.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompts[language] },
            { role: 'user', content: enhancedPrompt }
          ],
          model: 'gpt-4-turbo-preview',
          temperature: 0.3,
          max_tokens: 4000,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        });
        break;
      } catch (openAIError) {
        attempts++;
        
        // Log to Sentry
        Sentry.captureException(openAIError, {
          tags: {
            service: 'openai',
            attempt: attempts
          },
          extra: {
            userId: email,
            claimType: sanitizedClaimType
          }
        });
        
        if (attempts >= maxAttempts) {
          if (openAIError.status === 429) {
            return {
              statusCode: 429,
              body: JSON.stringify({ 
                error: 'AI service is currently at capacity. Please try again in a few minutes.' 
              })
            };
          }
          throw openAIError;
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }

    const generatedContent = completion.choices[0].message.content;

    // Generate document if requested
    let documentUrl = null;
    if (responseFormat === 'docx') {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: `Auto Insurance Claim Documentation`,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 }
            }),
            new Paragraph({
              text: `Vehicle: ${validatedVehicle.year} ${validatedVehicle.make} ${validatedVehicle.model}`,
              spacing: { after: 100 }
            }),
            new Paragraph({
              text: `Claim Type: ${sanitizedClaimType}`,
              spacing: { after: 100 }
            }),
            new Paragraph({
              text: `Generated: ${new Date().toLocaleDateString()}`,
              spacing: { after: 300 }
            }),
            new PageBreak(),
            ...generatedContent.split('\n').map(line => 
              new Paragraph({
                children: [new TextRun(line)],
                spacing: { after: 100 }
              })
            )
          ]
        }]
      });

      const buffer = await Packer.toBuffer(doc);
      
      // Store document with auto-deletion after 30 days
      const docKey = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await store.setJSON(docKey, {
        content: buffer.toString('base64'),
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `auto_claim_${sanitizedClaimType}_${Date.now()}.docx`,
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
      documentUrl = `/.netlify/functions/download?key=${docKey}`;
    }

    // Update user credits and log generation
    userData.credits -= 1;
    userData.generations.push({
      timestamp: new Date().toISOString(),
      claimType: sanitizedClaimType,
      vehicle: `${validatedVehicle.year} ${validatedVehicle.make} ${validatedVehicle.model}`,
      tokensUsed: completion.usage?.total_tokens || 0,
      responseFormat,
      ip: clientIp
    });

    // Limit generation history to last 100 for storage efficiency
    if (userData.generations.length > 100) {
      userData.generations = userData.generations.slice(-100);
    }

    await store.setJSON(userKey, userData);

    // Log successful generation
    console.log(`Generation successful for ${email}, credits remaining: ${userData.credits}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      },
      body: JSON.stringify({
        success: true,
        content: generatedContent,
        documentUrl,
        creditsRemaining: userData.credits,
        generationId: Date.now().toString(36),
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        }
      })
    };

  } catch (error) {
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        function: 'generate',
        environment: process.env.NODE_ENV || 'production'
      }
    });

    console.error('Generation error:', error);
    
    return {
      statusCode: error.statusCode || 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        error: 'Failed to generate content. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  } finally {
    // Ensure Redis connection is closed
    await redis.quit();
  }
});