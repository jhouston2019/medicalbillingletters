/**
 * ENHANCED LETTER GENERATION WITH QUALITY SYSTEMS
 * 
 * Integrates:
 * - Citation verification
 * - Quality assurance
 * - Outcome tracking
 * - Structured logging
 * - Advanced prompt engineering
 * 
 * QUALITY TARGETS:
 * - Citation accuracy: 95%+
 * - Output quality: 85%+
 * - No hallucinated citations
 * - No generic AI language
 * - Professional tone maintained
 */

const OpenAI = require("openai");
const { getSupabaseAdmin } = require("./_supabase");
const { canGenerateLetter, markPaymentUsed } = require("./payment-enforcer");
const { prepareForOpenAI, getSafeOpenAIParams } = require("./cost-protector");
const { sanitizeLetter } = require("./_helpers/sanitizer");

// Import new quality systems
const { 
  enhancePromptWithCitations, 
  verifyGeneratedLetter,
  getRelevantCitations,
  saveCitationVerification
} = require("./citation-verification-system");

const { 
  assessQuality,
  saveQualityMetrics,
  generateImprovementSuggestions
} = require("./quality-assurance-system");

const { 
  createOutcomeTracking
} = require("./outcome-tracking-system");

const { 
  createLogger,
  extractContextFromEvent,
  createTimer,
  EVENT_TYPES
} = require("./structured-logging-system");

// ============================================================================
// ENHANCED SYSTEM PROMPT WITH CITATIONS
// ============================================================================

function buildEnhancedSystemPrompt(citationContext) {
  return `You are a professional medical billing dispute specialist generating formal business letters.

CRITICAL REQUIREMENTS:

1. MEDICAL CODE ACCURACY:
   - Use ONLY verified CPT and ICD-10 codes provided in the context
   - Use EXACT code format (do not modify)
   - Include codes ONLY when directly relevant to billing error
   - NEVER create or invent medical codes
   - NEVER modify code descriptions

2. LEGAL CITATION ACCURACY:
   - Use ONLY verified federal/state laws provided in the context
   - Use EXACT citation format (do not modify)
   - Include citations ONLY when directly relevant
   - NEVER create or invent legal citations
   - NEVER modify citation text or numbers

3. SPECIFICITY REQUIREMENTS:
   - Include specific dates of service (not "recently" or "soon")
   - Include specific amounts (not "appropriate adjustment")
   - Include specific account/patient numbers
   - Include specific CPT codes with descriptions
   - Include specific billing errors with line item references
   - Include specific deadlines (not "as soon as possible")

4. PROFESSIONAL LANGUAGE:
   - Use formal business letter format
   - Avoid emotional language (upset, unfair, frustrated, disappointed)
   - Avoid hardship appeals (cannot afford, need help)
   - Avoid generic AI phrases (I am writing to inform you, at your earliest convenience)
   - Use direct, factual statements about billing errors

5. STRUCTURE REQUIREMENTS:
   - Patient information (name, address)
   - Date
   - Provider billing department information
   - RE: line with account number, date of service, amount in dispute
   - Professional salutation
   - Opening paragraph (state purpose: formal dispute of billing charges)
   - Body paragraphs (state specific billing errors with CPT codes and amounts)
   - Legal citations (if applicable: No Surprises Act, Balance Billing Protection)
   - Request for action (specific, with 30-day deadline)
   - Contact information
   - Professional closing

6. PROHIBITED CONTENT:
   - NO emotional appeals or hardship stories
   - NO threats to sue (unless attorney involved)
   - NO accusations of fraud (unless citing specific statute)
   - NO narrative storytelling
   - NO speculation or opinions
   - NO legal advice or interpretation
   - NO vague language ("seems incorrect", "doesn't make sense")

${citationContext}

OUTPUT FORMAT:
Generate a complete, professional business letter that is ready to print, sign, and mail.
The letter should be factual, specific, and professional throughout.`;
}

// ============================================================================
// ENHANCED USER PROMPT
// ============================================================================

function buildEnhancedUserPrompt(letterText, documentInfo, userInfo, relevantCitations) {
  const citationList = relevantCitations.length > 0
    ? relevantCitations.map((c, i) => `${i + 1}. ${c.citation}: ${c.summary}`).join('\n')
    : 'No specific statutory citations available for this scenario.';
  
  return `Generate a professional insurance claim response letter based on the following:

INSURANCE COMPANY LETTER:
${letterText}

CLAIM INFORMATION:
- Claim Type: ${documentInfo.claim_type || 'Not specified'}
- Claim Amount: ${documentInfo.claim_amount || 'Not specified'}
- Phase: ${documentInfo.phase || 'Not specified'}
- State: ${documentInfo.state_code || 'Not specified'}
- Issue Type: ${documentInfo.issue_type || 'Denial/Dispute'}

USER INFORMATION (use these exact values):
- Name: ${userInfo.name || '[YOUR NAME]'}
- Address: ${userInfo.address || '[YOUR ADDRESS]'}
- Phone: ${userInfo.phone || '[YOUR PHONE]'}
- Email: ${userInfo.email || '[YOUR EMAIL]'}
- Claim Number: ${userInfo.claimNumber || '[CLAIM NUMBER]'}
- Policy Number: ${userInfo.policyNumber || '[POLICY NUMBER]'}
- Date of Loss: ${userInfo.lossDate || '[DATE OF LOSS]'}
- Letter Date: ${userInfo.letterDate || '[LETTER DATE]'}

RELEVANT STATUTORY CITATIONS (verified):
${citationList}

GENERATION REQUIREMENTS:

1. ACKNOWLEDGE THEIR LETTER:
   - Reference specific date of their letter
   - Reference claim number and policy number
   - State purpose of your response

2. STATE DISAGREEMENT (if applicable):
   - Be specific about what you disagree with
   - Reference specific amounts, dates, or facts
   - Avoid emotional language

3. PROVIDE FACTUAL BASIS:
   - State facts that support your position
   - Reference policy language if applicable
   - Include relevant statutory citations (from list above only)
   - Do NOT create new citations

4. REQUEST SPECIFIC ACTION:
   - State exactly what you want them to do
   - Include specific deadline (10 business days from today)
   - Request written response

5. INCLUDE CONTACT INFORMATION:
   - Your phone number
   - Your email address
   - Best times to reach you

6. PROFESSIONAL CLOSING:
   - "Sincerely," or "Respectfully,"
   - Signature line
   - Printed name

QUALITY CHECKLIST:
✓ Specific dates (not "recently")
✓ Specific amounts (not "fair compensation")
✓ Specific deadline (not "soon")
✓ Claim and policy numbers included
✓ Professional tone throughout
✓ No emotional language
✓ No generic AI phrases
✓ Citations verified (if included)

Generate the letter now:`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

exports.handler = async (event) => {
  // Initialize logger
  const context = extractContextFromEvent(event);
  const logger = createLogger(context);
  const timer = createTimer('generate_letter_enhanced');
  
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
    logger.info(EVENT_TYPES.GENERATION_STARTED, {
      message: 'Enhanced letter generation started'
    });
    
    const { documentId, userId, userInfo, stateCode } = JSON.parse(event.body || '{}');
    
    if (!documentId || !userId) {
      await logger.error(EVENT_TYPES.GENERATION_FAILED, new Error('Missing required parameters'));
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Document ID and User ID are required' })
      };
    }

    timer.checkpoint('validation_complete');

    // STEP 1: Get document from database WITH USER VERIFICATION
    const supabase = getSupabaseAdmin();
    const { data: document, error: fetchError } = await supabase
      .from('claim_letters')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !document) {
      await logger.error(EVENT_TYPES.GENERATION_FAILED, new Error('Document not found'));
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

    timer.checkpoint('document_fetched');

    // STEP 2: Verify payment status
    const generationCheck = await canGenerateLetter(document.user_id, documentId);
    
    if (!generationCheck.allowed) {
      await logger.warn(EVENT_TYPES.GENERATION_FAILED, {
        reason: 'Payment verification failed',
        message: generationCheck.reason
      });
      
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

    timer.checkpoint('payment_verified');

    // STEP 3: Check for hard stop conditions
    const analysis = document.analysis || {};
    if (analysis.riskAssessment?.hardStop) {
      await logger.logHardStop('generation_blocked', {
        code: analysis.riskAssessment.primaryCondition?.code,
        severity: 'critical',
        requiresAttorney: true,
        message: 'Hard stop condition prevents generation'
      });
      
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

    timer.checkpoint('safety_check_complete');

    // STEP 4: Get extracted text and prepare for AI
    const letterText = document.extracted_text || document.letter_text;
    if (!letterText || letterText.length < 50) {
      throw new Error('No extracted text available. Please re-upload the document.');
    }

    const preparedInput = prepareForOpenAI(letterText);
    
    await logger.logPerformance(EVENT_TYPES.TEXT_EXTRACTION, 'text_prepared', {
      original_length: preparedInput.originalLength,
      processed_length: preparedInput.processedLength,
      truncated: preparedInput.truncated,
      estimated_tokens: preparedInput.estimatedInputTokens,
      estimated_cost: preparedInput.estimatedCost
    });

    timer.checkpoint('text_prepared');

    // STEP 5: Get relevant citations for this scenario
    const issueType = document.issue_type || 'denial';
    const relevantCitations = getRelevantCitations(
      stateCode || document.state_code,
      document.claim_type,
      document.phase,
      issueType
    );
    
    await logger.info(EVENT_TYPES.CITATION_VERIFICATION, {
      message: 'Retrieved relevant citations',
      citation_count: relevantCitations.length,
      state: stateCode || document.state_code
    });

    timer.checkpoint('citations_retrieved');

    // STEP 6: Build enhanced prompts with citations
    const citationContext = relevantCitations.length > 0
      ? `\n\nVERIFIED CITATIONS AVAILABLE:\n${relevantCitations.map(c => `- ${c.citation}: ${c.summary}`).join('\n')}`
      : '';
    
    const systemPrompt = buildEnhancedSystemPrompt(citationContext);
    const userPrompt = buildEnhancedUserPrompt(
      preparedInput.text,
      document,
      userInfo,
      relevantCitations
    );

    timer.checkpoint('prompts_built');

    // STEP 7: Generate letter using OpenAI with enhanced prompts
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const safeParams = getSafeOpenAIParams();
    
    const aiStartTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      ...safeParams,
      temperature: 0.3, // Slightly higher for better quality while maintaining control
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const aiDuration = Date.now() - aiStartTime;
    const rawLetter = completion.choices?.[0]?.message?.content;

    if (!rawLetter) {
      throw new Error('No letter generated from AI');
    }

    // Log AI operation
    await logger.logAIOperation(EVENT_TYPES.GENERATION_COMPLETED, {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      tokens: completion.usage?.total_tokens || 0,
      cost: calculateCost(completion.usage),
      duration: aiDuration,
      prompt_tokens: completion.usage?.prompt_tokens || 0,
      completion_tokens: completion.usage?.completion_tokens || 0
    });

    timer.checkpoint('ai_generation_complete');

    // STEP 8: Sanitize output
    const generatedLetter = sanitizeLetter(rawLetter);

    // STEP 9: CITATION VERIFICATION
    console.log('=== CITATION VERIFICATION ===');
    const citationVerification = verifyGeneratedLetter(
      generatedLetter,
      stateCode || document.state_code,
      document.claim_type
    );
    
    await logger.logQualityCheck('citation_verification', {
      passesCheck: citationVerification.passesVerification,
      score: citationVerification.qualityScore,
      accuracy_rate: citationVerification.accuracyRate,
      has_hallucinations: citationVerification.hallucinations?.hasIssues,
      ...citationVerification
    });
    
    // Save citation verification to database
    await saveCitationVerification(documentId, citationVerification);
    
    console.log(`Citation Quality Score: ${citationVerification.qualityScore}/100`);
    console.log(`Citation Accuracy: ${citationVerification.accuracyRate}%`);
    
    if (citationVerification.hallucinations?.hasIssues) {
      console.warn('⚠️ HALLUCINATIONS DETECTED:', citationVerification.hallucinations.issueCount);
      
      await logger.warn(EVENT_TYPES.HALLUCINATION_DETECTED, {
        hallucination_count: citationVerification.hallucinations.issueCount,
        issues: citationVerification.hallucinations.issues
      });
    }

    timer.checkpoint('citation_verification_complete');

    // STEP 10: QUALITY ASSESSMENT
    console.log('=== QUALITY ASSESSMENT ===');
    const qualityAssessment = assessQuality(generatedLetter);
    
    await logger.logQualityCheck('quality_assessment', {
      passesCheck: qualityAssessment.passesQualityCheck,
      score: qualityAssessment.overallQualityScore,
      grade: qualityAssessment.qualityGrade,
      ...qualityAssessment
    });
    
    // Save quality metrics to database
    await saveQualityMetrics(documentId, qualityAssessment);
    
    console.log(`Overall Quality Score: ${qualityAssessment.overallQualityScore}/100 (${qualityAssessment.qualityGrade})`);
    console.log(`Generic Score: ${qualityAssessment.genericScore}/100`);
    console.log(`Specificity Score: ${qualityAssessment.specificityScore}/100`);
    console.log(`Professionalism Score: ${qualityAssessment.professionalismScore}/100`);
    
    if (qualityAssessment.criticalIssues > 0) {
      console.warn('⚠️ CRITICAL QUALITY ISSUES:', qualityAssessment.criticalIssues);
    }

    timer.checkpoint('quality_assessment_complete');

    // STEP 11: QUALITY GATE - Regenerate if quality is too low
    if (qualityAssessment.mustRegenerate) {
      console.warn('❌ QUALITY GATE FAILED - Letter must be regenerated');
      
      await logger.warn(EVENT_TYPES.QUALITY_FAILURE, {
        reason: 'Quality score below threshold',
        quality_score: qualityAssessment.overallQualityScore,
        critical_issues: qualityAssessment.criticalIssues,
        recommendations: qualityAssessment.recommendations
      });
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          qualityGateFailed: true,
          message: 'Generated letter did not meet quality standards. Please try again.',
          qualityScore: qualityAssessment.overallQualityScore,
          issues: qualityAssessment.allIssues.slice(0, 5),
          recommendations: qualityAssessment.recommendations.slice(0, 5)
        })
      };
    }

    // STEP 12: Generate improvement suggestions (even if passed)
    const improvementSuggestions = generateImprovementSuggestions(qualityAssessment);

    timer.checkpoint('quality_gate_passed');

    // STEP 13: Save generated letter to database
    const { error: updateError } = await supabase
      .from('claim_letters')
      .update({
        generated_letter: generatedLetter,
        ai_response: generatedLetter,
        status: 'completed',
        citation_quality_score: citationVerification.qualityScore,
        output_quality_score: qualityAssessment.overallQualityScore,
        quality_grade: qualityAssessment.qualityGrade
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Failed to save generated letter:', updateError);
    }

    timer.checkpoint('letter_saved');

    // STEP 14: Mark payment as used
    await markPaymentUsed(documentId);
    console.log('✅ Payment marked as used');

    // STEP 15: Create outcome tracking record
    await createOutcomeTracking({
      documentId,
      userId,
      claimType: document.claim_type,
      phase: document.phase,
      issueType: issueType,
      stateCode: stateCode || document.state_code,
      claimAmountRange: document.claim_amount,
      originalClaimAmount: userInfo.originalClaimAmount || null,
      citationQualityScore: citationVerification.qualityScore,
      outputQualityScore: qualityAssessment.overallQualityScore
    });

    timer.checkpoint('outcome_tracking_created');

    // STEP 16: Get final performance metrics
    const performanceMetrics = timer.end();
    
    await logger.logPerformance(EVENT_TYPES.GENERATION_COMPLETED, 'generation_complete', {
      duration_ms: performanceMetrics.duration_ms,
      tokens_used: completion.usage?.total_tokens || 0,
      cost_usd: calculateCost(completion.usage),
      quality_score: qualityAssessment.overallQualityScore,
      citation_score: citationVerification.qualityScore
    });

    // STEP 17: Return comprehensive results
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
        
        // Quality metrics
        quality: {
          overallScore: qualityAssessment.overallQualityScore,
          grade: qualityAssessment.qualityGrade,
          genericScore: qualityAssessment.genericScore,
          specificityScore: qualityAssessment.specificityScore,
          professionalismScore: qualityAssessment.professionalismScore,
          structureScore: qualityAssessment.structureScore,
          passesCheck: qualityAssessment.passesQualityCheck
        },
        
        // Citation metrics
        citations: {
          qualityScore: citationVerification.qualityScore,
          accuracyRate: citationVerification.accuracyRate,
          totalCitations: citationVerification.totalCitations,
          verifiedCitations: citationVerification.verifiedCitations,
          hasHallucinations: citationVerification.hallucinations?.hasIssues || false,
          passesVerification: citationVerification.passesVerification
        },
        
        // Warnings and recommendations
        warnings: [
          ...citationVerification.warnings,
          ...(qualityAssessment.criticalIssues > 0 ? ['Letter has critical quality issues'] : [])
        ],
        recommendations: improvementSuggestions,
        
        // Performance
        performance: {
          totalDuration: performanceMetrics.duration_ms,
          tokensUsed: completion.usage?.total_tokens || 0,
          estimatedCost: calculateCost(completion.usage)
        },
        
        // Metadata
        metadata: {
          claimType: document.claim_type,
          phase: document.phase,
          state: stateCode || document.state_code,
          generatedAt: new Date().toISOString(),
          characterCount: generatedLetter.length,
          wordCount: generatedLetter.split(/\s+/).length
        }
      })
    };

  } catch (error) {
    await logger.error(EVENT_TYPES.GENERATION_FAILED, error, {
      message: 'Letter generation failed',
      error_details: error.message
    });
    
    console.error('Enhanced letter generation error:', error);
    
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate OpenAI API cost
 * @param {Object} usage - Usage object from OpenAI
 * @returns {number} - Cost in USD
 */
function calculateCost(usage) {
  if (!usage) return 0;
  
  const inputCost = (usage.prompt_tokens || 0) / 1000000 * 0.150;
  const outputCost = (usage.completion_tokens || 0) / 1000000 * 0.600;
  
  return inputCost + outputCost;
}
