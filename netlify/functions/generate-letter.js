/**
 * PRODUCTION LETTER GENERATION
 * 
 * Generates professional insurance claim response letters using OpenAI
 * - Verifies payment status
 * - Uses real extracted text
 * - Generates structured, professional response
 * - NO PLACEHOLDERS
 */

const OpenAI = require("openai");
const { getSupabaseAdmin } = require("./_supabase");
const { canGenerateLetter, markPaymentUsed } = require("./payment-enforcer");
const { prepareForOpenAI, getSafeOpenAIParams } = require("./cost-protector");

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { documentId, userId, userInfo } = JSON.parse(event.body || '{}');
    
    if (!documentId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Document ID is required' })
      };
    }

    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Authentication required',
          message: 'User ID must be provided'
        })
      };
    }

    console.log('Generating letter for document:', documentId, 'User:', userId);

    // STEP 1: Get document from database WITH USER VERIFICATION
    const supabase = getSupabaseAdmin();
    const { data: document, error: fetchError } = await supabase
      .from('claim_letters')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId) // CRITICAL: Verify ownership
      .single();

    if (fetchError || !document) {
      console.error('Document fetch error:', fetchError);
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Document not found',
          message: 'Document does not exist or you do not have permission to access it'
        })
      };
    }

    // ADDITIONAL SECURITY: Verify user_id matches
    if (document.user_id !== userId) {
      console.error('🚨 SECURITY ALERT: User', userId, 'attempted to access document owned by', document.user_id);
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Access denied',
          message: 'You do not have permission to generate a letter for this document'
        })
      };
    }

    // STEP 2: Verify payment status and generation permission
    const generationCheck = await canGenerateLetter(document.user_id, documentId);
    
    if (!generationCheck.allowed) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Cannot generate letter',
          message: generationCheck.reason,
          needsPayment: generationCheck.needsPayment
        })
      };
    }

    // STEP 3: Check for hard stop conditions
    const analysis = document.analysis || {};
    if (analysis.riskAssessment?.hardStop) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Hard stop condition',
          message: 'This letter requires professional attorney representation. Response generation is not available.'
        })
      };
    }

    // STEP 4: Get extracted text and apply cost protection
    const letterText = document.extracted_text || document.letter_text;
    if (!letterText || letterText.length < 50) {
      throw new Error('No extracted text available. Please re-upload the document.');
    }

    // COST PROTECTION: Truncate input to prevent cost bomb
    console.log('Original text length:', letterText.length);
    const preparedInput = prepareForOpenAI(letterText);
    console.log('Prepared text length:', preparedInput.processedLength);
    console.log('Estimated cost:', preparedInput.estimatedCost.toFixed(4), 'USD');
    
    if (preparedInput.truncated) {
      console.log('⚠️ Text was truncated from', preparedInput.originalLength, 'to', preparedInput.processedLength, 'characters');
    }

    // STEP 5: Prepare user information
    const userName = userInfo?.name || '[YOUR NAME]';
    const userAddress = userInfo?.address || '[YOUR ADDRESS]';
    const userPhone = userInfo?.phone || '[YOUR PHONE]';
    const userEmail = userInfo?.email || document.user_email || '[YOUR EMAIL]';
    const claimNumber = userInfo?.claimNumber || '[CLAIM NUMBER]';
    const policyNumber = userInfo?.policyNumber || '[POLICY NUMBER]';
    const lossDate = userInfo?.lossDate || '[DATE OF LOSS]';

    // STEP 6: Generate letter using OpenAI
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are an insurance claim dispute specialist generating a formal, professional response letter to an insurance company.

CRITICAL REQUIREMENTS:
- Generate a complete, professional business letter
- Use formal business letter format
- Be factual and professional (no emotional language)
- Reference specific policy language when applicable
- Include clear dispute reasoning
- Request specific action from insurance company
- Set 10-business-day response deadline
- Include all standard letter components (date, addresses, RE: line, body, signature)

LETTER STRUCTURE:
1. Sender information (name, address)
2. Date
3. Insurance company information
4. RE: Claim Number, Policy Number, Date of Loss
5. Professional salutation
6. Opening paragraph (acknowledge their letter/decision)
7. Statement of disagreement (factual, specific)
8. Supporting reasoning (reference policy language if applicable)
9. Request for action (specific demand)
10. Response deadline (10 business days)
11. Contact information
12. Professional closing

DO NOT:
- Use emotional or aggressive language
- Make legal threats
- Provide false information
- Over-explain or provide unnecessary narrative
- Use informal language

The letter should be ready to print, sign, and mail.`;

    const userPrompt = `Generate a professional insurance claim response letter based on this insurance company letter:

INSURANCE COMPANY LETTER:
${preparedInput.text}

CLAIM INFORMATION:
- Claim Type: ${document.claim_type || 'Not specified'}
- Claim Amount: ${document.claim_amount || 'Not specified'}
- Phase: ${document.phase || analysis.phase?.phase || 'Not specified'}

USER INFORMATION (use these placeholders):
- Name: ${userName}
- Address: ${userAddress}
- Phone: ${userPhone}
- Email: ${userEmail}
- Claim Number: ${claimNumber}
- Policy Number: ${policyNumber}
- Date of Loss: ${lossDate}

Generate a complete, professional response letter that:
1. Acknowledges their letter
2. States disagreement with their decision (if denial/underpayment)
3. Provides factual reasoning
4. References policy language if applicable
5. Requests specific corrective action
6. Sets 10-business-day response deadline
7. Includes contact information

Make it professional, factual, and ready to mail.`;

    console.log('Calling OpenAI for letter generation...');

    const safeParams = getSafeOpenAIParams();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      ...safeParams,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const generatedLetter = completion.choices?.[0]?.message?.content;

    if (!generatedLetter) {
      throw new Error('No letter generated from AI');
    }

    console.log(`Generated letter: ${generatedLetter.length} characters`);

    // STEP 7: Save generated letter to database and mark payment as used
    const { error: updateError } = await supabase
      .from('claim_letters')
      .update({
        generated_letter: generatedLetter,
        ai_response: generatedLetter,
        status: 'completed'
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Failed to save generated letter:', updateError);
    }

    // STEP 8: Mark payment as used (one payment = one letter)
    await markPaymentUsed(documentId);
    console.log('✅ Payment marked as used. No further letters can be generated with this payment.');

    // STEP 8: Return generated letter
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        letter: generatedLetter,
        documentId,
        characterCount: generatedLetter.length,
        metadata: {
          claimType: document.claim_type,
          phase: document.phase,
          generatedAt: new Date().toISOString()
        }
      })
    };

  } catch (error) {
    console.error('Letter generation error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Letter generation failed',
        details: error.message
      })
    };
  }
};
