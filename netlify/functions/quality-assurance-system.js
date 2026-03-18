/**
 * QUALITY ASSURANCE SYSTEM
 * 
 * Detects and prevents generic AI language, ensures specificity and professionalism.
 * 
 * FEATURES:
 * - Generic phrase detection (40+ patterns)
 * - Specificity scoring (dates, amounts, references)
 * - Professional language validation
 * - Emotional language detection
 * - Adversarial language detection
 * - Structure quality assessment
 * 
 * QUALITY TARGETS:
 * - Generic Score: 90%+ (low generic language)
 * - Specificity Score: 85%+
 * - Professionalism Score: 95%+
 * - Overall Quality: 85%+
 */

const { getSupabaseAdmin } = require("./_supabase");

// ============================================================================
// GENERIC AI LANGUAGE PATTERNS
// ============================================================================

/**
 * Generic phrases that indicate AI-generated content
 * These should be REMOVED or REPLACED with specific language
 */
const GENERIC_AI_PHRASES = [
  // Medical billing specific generic language
  { phrase: "I am writing to dispute this bill", severity: "high", replacement: "I am disputing [specific charge/error]" },
  { phrase: "This bill seems incorrect", severity: "high", replacement: "[state specific error]" },
  { phrase: "I cannot afford this", severity: "high", replacement: "[remove - focus on billing errors]" },
  { phrase: "Please reduce my bill", severity: "high", replacement: "I request adjustment of [specific amount]" },
  { phrase: "This is too expensive", severity: "high", replacement: "[state specific billing error]" },
  { phrase: "I am a hardship case", severity: "high", replacement: "[remove - focus on billing errors]" },
  { phrase: "I need financial assistance", severity: "high", replacement: "[remove - focus on billing errors]" },
  { phrase: "I don't understand this bill", severity: "medium", replacement: "[state specific error]" },
  { phrase: "This doesn't make sense", severity: "medium", replacement: "[state specific error]" },
  { phrase: "I was surprised by this bill", severity: "medium", replacement: "[cite No Surprises Act if applicable]" },
  
  // Generic AI language
  { phrase: "I hope this letter finds you well", severity: "high", replacement: "[remove]" },
  { phrase: "I am reaching out to you", severity: "high", replacement: "[state purpose directly]" },
  { phrase: "I would like to bring to your attention", severity: "high", replacement: "[state issue directly]" },
  { phrase: "It has come to my attention", severity: "high", replacement: "[state issue directly]" },
  { phrase: "I am writing to inform you", severity: "medium", replacement: "[state purpose directly]" },
  { phrase: "Please be advised", severity: "medium", replacement: "[state fact directly]" },
  { phrase: "Kindly note", severity: "medium", replacement: "[state fact directly]" },
  { phrase: "I trust this matter will be resolved", severity: "medium", replacement: "I expect resolution by [date]" },
  
  // Emotional appeals
  { phrase: "This is causing me stress", severity: "high", replacement: "[remove]" },
  { phrase: "I am very upset", severity: "high", replacement: "[remove]" },
  { phrase: "This is unfair", severity: "high", replacement: "[state specific billing error]" },
  { phrase: "I feel cheated", severity: "high", replacement: "[remove]" },
  { phrase: "This is outrageous", severity: "high", replacement: "[remove]" },
  { phrase: "I am disappointed", severity: "high", replacement: "[remove]" },
  
  // Vague language
  { phrase: "as soon as possible", severity: "medium", replacement: "within 30 days" },
  { phrase: "at your earliest convenience", severity: "low", replacement: "by [specific date]" },
  { phrase: "in a timely manner", severity: "medium", replacement: "within [X] days" },
  { phrase: "promptly", severity: "low", replacement: "within [X] days" },
  { phrase: "expeditiously", severity: "medium", replacement: "within [X] days" },
  
  // Vague amount references
  { phrase: "appropriate compensation", severity: "high", replacement: "$[specific amount]" },
  { phrase: "fair settlement", severity: "high", replacement: "$[specific amount]" },
  { phrase: "reasonable amount", severity: "high", replacement: "$[specific amount]" },
  
  // AI-typical hedging
  { phrase: "it appears that", severity: "medium", replacement: "[state fact directly]" },
  { phrase: "it seems that", severity: "medium", replacement: "[state fact directly]" },
  { phrase: "I believe that", severity: "high", replacement: "[state fact directly]" },
  { phrase: "in my opinion", severity: "high", replacement: "[state fact directly]" },
  { phrase: "I feel that", severity: "high", replacement: "[state fact directly]" },
  
  // Overly formal AI language
  { phrase: "pursuant to", severity: "low", replacement: "under" },
  { phrase: "aforementioned", severity: "medium", replacement: "the [specific item]" },
  { phrase: "herein", severity: "medium", replacement: "in this letter" },
  { phrase: "heretofore", severity: "medium", replacement: "[specific time reference]" },
  { phrase: "henceforth", severity: "medium", replacement: "from [date] forward" },
  
  // Weak action verbs
  { phrase: "I would like to", severity: "medium", replacement: "I request" },
  { phrase: "I wish to", severity: "medium", replacement: "I request" },
  { phrase: "I hope to", severity: "high", replacement: "I request" },
  { phrase: "I trust that", severity: "medium", replacement: "I expect" },
  
  // Chatbot-like language
  { phrase: "thank you for your time", severity: "low", replacement: "[remove or replace with deadline]" },
  { phrase: "thank you for your consideration", severity: "low", replacement: "[remove or replace with deadline]" },
  { phrase: "I appreciate your assistance", severity: "medium", replacement: "[remove]" },
  { phrase: "please let me know", severity: "medium", replacement: "please respond by [date]" },
  
  // Redundant phrases
  { phrase: "I am writing this letter to", severity: "medium", replacement: "[state purpose directly]" },
  { phrase: "the purpose of this letter is", severity: "medium", replacement: "[state purpose directly]" }
];

// ============================================================================
// SPECIFICITY REQUIREMENTS
// ============================================================================

/**
 * Check for specific elements that improve letter quality
 */
const SPECIFICITY_CHECKS = {
  dates: {
    patterns: [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // MM/DD/YYYY
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, // Month DD, YYYY
      /\b\d{4}-\d{2}-\d{2}\b/g // YYYY-MM-DD
    ],
    weight: 25,
    required: true,
    examples: ["January 15, 2026", "01/15/2026"]
  },
  
  amounts: {
    patterns: [
      /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g // $1,234.56
    ],
    weight: 20,
    required: true,
    examples: ["$5,000.00", "$1,234.56"]
  },
  
  accountNumbers: {
    patterns: [
      /(?:account|patient|medical record)\s+(?:number|#|no\.?):\s*[A-Z0-9-]+/gi,
      /account\s+[A-Z0-9-]{5,}/gi
    ],
    weight: 20,
    required: true,
    examples: ["Account Number: MED-123-456", "Patient #XYZ789"]
  },
  
  cptCodes: {
    patterns: [
      /\bCPT\s+\d{5}\b/gi,
      /\b\d{5}\b/g
    ],
    weight: 20,
    required: false,
    examples: ["CPT 99213", "71046"]
  },
  
  icd10Codes: {
    patterns: [
      /\bICD-10\s+[A-Z]\d{2}(\.\d{1,4})?\b/gi,
      /\b[A-Z]\d{2}\.\d{1,4}\b/g
    ],
    weight: 15,
    required: false,
    examples: ["ICD-10 E11.9", "M54.5"]
  },
  
  deadlines: {
    patterns: [
      /(?:by|before|within|no later than)\s+(?:\d+\s+(?:business\s+)?days?|\w+\s+\d{1,2},?\s+\d{4})/gi,
      /deadline:\s*\w+\s+\d{1,2},?\s+\d{4}/gi
    ],
    weight: 20,
    required: true,
    examples: ["within 10 business days", "by January 30, 2026", "no later than 30 days"]
  }
};

// ============================================================================
// PROFESSIONAL LANGUAGE STANDARDS
// ============================================================================

/**
 * Emotional language that should be avoided
 */
const EMOTIONAL_LANGUAGE = [
  { phrase: "unfair", severity: "high" },
  { phrase: "unreasonable", severity: "high" },
  { phrase: "outrageous", severity: "critical" },
  { phrase: "ridiculous", severity: "critical" },
  { phrase: "absurd", severity: "critical" },
  { phrase: "disappointed", severity: "high" },
  { phrase: "frustrated", severity: "high" },
  { phrase: "angry", severity: "critical" },
  { phrase: "upset", severity: "high" },
  { phrase: "shocked", severity: "high" },
  { phrase: "appalled", severity: "critical" },
  { phrase: "disgusted", severity: "critical" }
];

/**
 * Adversarial language that should be avoided
 */
const ADVERSARIAL_LANGUAGE = [
  { phrase: "bad faith", severity: "critical" }, // Unless citing statute
  { phrase: "deceptive", severity: "high" },
  { phrase: "dishonest", severity: "critical" },
  { phrase: "lying", severity: "critical" },
  { phrase: "fraudulent", severity: "critical" }, // Unless in response to fraud allegation
  { phrase: "illegal", severity: "high" },
  { phrase: "violation of law", severity: "high" },
  { phrase: "sue", severity: "critical" },
  { phrase: "lawsuit", severity: "critical" },
  { phrase: "litigation", severity: "critical" },
  { phrase: "attorney", severity: "high" }, // Unless already involved
  { phrase: "lawyer", severity: "high" },
  { phrase: "legal action", severity: "critical" },
  { phrase: "demand", severity: "medium" },
  { phrase: "insist", severity: "medium" },
  { phrase: "require you to", severity: "medium" }
];

// ============================================================================
// QUALITY ASSESSMENT ENGINE
// ============================================================================

/**
 * Detect generic AI language
 * @param {string} text - Letter text
 * @returns {Object} - Detection results
 */
function detectGenericLanguage(text) {
  const detectedPhrases = [];
  let totalSeverity = 0;
  
  GENERIC_AI_PHRASES.forEach(item => {
    const regex = new RegExp(item.phrase, 'gi');
    const matches = text.match(regex);
    
    if (matches) {
      const severityScore = { low: 1, medium: 2, high: 3, critical: 4 }[item.severity];
      totalSeverity += matches.length * severityScore;
      
      detectedPhrases.push({
        phrase: item.phrase,
        occurrences: matches.length,
        severity: item.severity,
        replacement: item.replacement,
        positions: []
      });
    }
  });
  
  // Calculate generic score (100 = no generic language)
  const maxSeverity = 50; // Threshold for 0 score
  const genericScore = Math.max(0, Math.round(100 - (totalSeverity / maxSeverity) * 100));
  
  return {
    hasGenericLanguage: detectedPhrases.length > 0,
    genericPhraseCount: detectedPhrases.length,
    genericPhrases: detectedPhrases,
    totalSeverity,
    genericScore, // 0-100 (100 = best)
    passesCheck: genericScore >= 90,
    recommendations: detectedPhrases.map(p => 
      `Replace "${p.phrase}" with ${p.replacement}`
    )
  };
}

/**
 * Assess specificity of letter
 * @param {string} text - Letter text
 * @returns {Object} - Specificity assessment
 */
function assessSpecificity(text) {
  const specificityResults = {};
  let totalScore = 0;
  let maxScore = 0;
  
  for (const [category, config] of Object.entries(SPECIFICITY_CHECKS)) {
    let found = false;
    let count = 0;
    
    for (const pattern of config.patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        found = true;
        count += matches.length;
      }
    }
    
    specificityResults[category] = {
      found,
      count,
      required: config.required,
      weight: config.weight,
      examples: config.examples
    };
    
    if (found) {
      totalScore += config.weight;
    }
    
    maxScore += config.weight;
  }
  
  const specificityScore = Math.round((totalScore / maxScore) * 100);
  
  // Check for required elements
  const missingRequired = Object.entries(specificityResults)
    .filter(([_, result]) => result.required && !result.found)
    .map(([category, result]) => ({
      category,
      examples: result.examples
    }));
  
  return {
    hasSpecificElements: totalScore > 0,
    specificityScore, // 0-100
    specificityResults,
    missingRequired,
    passesCheck: specificityScore >= 85 && missingRequired.length === 0,
    recommendations: missingRequired.map(item => 
      `Add specific ${item.category}. Examples: ${item.examples.join(', ')}`
    )
  };
}

/**
 * Detect emotional language
 * @param {string} text - Letter text
 * @returns {Object} - Detection results
 */
function detectEmotionalLanguage(text) {
  const detectedPhrases = [];
  let criticalCount = 0;
  
  EMOTIONAL_LANGUAGE.forEach(item => {
    const regex = new RegExp(`\\b${item.phrase}\\b`, 'gi');
    const matches = text.match(regex);
    
    if (matches) {
      if (item.severity === 'critical') criticalCount += matches.length;
      
      detectedPhrases.push({
        phrase: item.phrase,
        occurrences: matches.length,
        severity: item.severity
      });
    }
  });
  
  return {
    hasEmotionalLanguage: detectedPhrases.length > 0,
    emotionalPhraseCount: detectedPhrases.length,
    emotionalPhrases: detectedPhrases,
    criticalCount,
    passesCheck: criticalCount === 0,
    recommendations: detectedPhrases.map(p => 
      `Remove emotional language: "${p.phrase}"`
    )
  };
}

/**
 * Detect adversarial language
 * @param {string} text - Letter text
 * @returns {Object} - Detection results
 */
function detectAdversarialLanguage(text) {
  const detectedPhrases = [];
  let criticalCount = 0;
  
  ADVERSARIAL_LANGUAGE.forEach(item => {
    const regex = new RegExp(`\\b${item.phrase}\\b`, 'gi');
    const matches = text.match(regex);
    
    if (matches) {
      if (item.severity === 'critical') criticalCount += matches.length;
      
      detectedPhrases.push({
        phrase: item.phrase,
        occurrences: matches.length,
        severity: item.severity
      });
    }
  });
  
  return {
    hasAdversarialLanguage: detectedPhrases.length > 0,
    adversarialPhraseCount: detectedPhrases.length,
    adversarialPhrases: detectedPhrases,
    criticalCount,
    passesCheck: criticalCount === 0,
    recommendations: detectedPhrases.map(p => 
      `Remove adversarial language: "${p.phrase}"`
    )
  };
}

/**
 * Assess structure quality
 * @param {string} text - Letter text
 * @returns {Object} - Structure assessment
 */
function assessStructure(text) {
  const checks = {
    hasProperHeader: /^.{0,200}(?:RE:|Subject:|Regarding:)/im.test(text),
    hasDate: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i.test(text),
    hasClaimReference: /claim\s+(?:number|#|no\.?):\s*[A-Z0-9-]+/gi.test(text),
    hasPolicyReference: /policy\s+(?:number|#|no\.?):\s*[A-Z0-9-]+/gi.test(text),
    hasClearRequest: /(?:I request|I am requesting|please provide|please respond|please review)/i.test(text),
    hasDeadline: /(?:by|before|within|no later than)\s+(?:\d+\s+(?:business\s+)?days?|\w+\s+\d{1,2},?\s+\d{4})/i.test(text),
    hasClosing: /(?:sincerely|respectfully|regards),?\s*$/im.test(text),
    hasContactInfo: /(?:phone|email|contact):/i.test(text)
  };
  
  const passedChecks = Object.values(checks).filter(v => v).length;
  const totalChecks = Object.keys(checks).length;
  const structureScore = Math.round((passedChecks / totalChecks) * 100);
  
  const missingElements = Object.entries(checks)
    .filter(([_, passed]) => !passed)
    .map(([element, _]) => element);
  
  return {
    structureScore, // 0-100
    checks,
    passedChecks,
    totalChecks,
    missingElements,
    passesCheck: structureScore >= 75,
    recommendations: missingElements.map(element => 
      `Add ${element.replace(/([A-Z])/g, ' $1').toLowerCase()}`
    )
  };
}

/**
 * Calculate professionalism score
 * @param {Object} emotionalResults - Emotional language detection
 * @param {Object} adversarialResults - Adversarial language detection
 * @returns {Object} - Professionalism assessment
 */
function assessProfessionalism(emotionalResults, adversarialResults) {
  let score = 100;
  
  // Deduct for emotional language
  score -= emotionalResults.emotionalPhraseCount * 5;
  score -= emotionalResults.criticalCount * 10;
  
  // Deduct for adversarial language
  score -= adversarialResults.adversarialPhraseCount * 10;
  score -= adversarialResults.criticalCount * 15;
  
  score = Math.max(0, score);
  
  return {
    professionalismScore: score,
    passesCheck: score >= 95,
    hasEmotionalLanguage: emotionalResults.hasEmotionalLanguage,
    hasAdversarialLanguage: adversarialResults.hasAdversarialLanguage,
    recommendations: [
      ...emotionalResults.recommendations,
      ...adversarialResults.recommendations
    ]
  };
}

// ============================================================================
// COMPREHENSIVE QUALITY ASSESSMENT
// ============================================================================

/**
 * Perform comprehensive quality assessment
 * @param {string} text - Generated letter text
 * @returns {Object} - Complete quality report
 */
function assessQuality(text) {
  // Run all checks
  const genericCheck = detectGenericLanguage(text);
  const specificityCheck = assessSpecificity(text);
  const emotionalCheck = detectEmotionalLanguage(text);
  const adversarialCheck = detectAdversarialLanguage(text);
  const structureCheck = assessStructure(text);
  const professionalismCheck = assessProfessionalism(emotionalCheck, adversarialCheck);
  
  // Calculate overall quality score (weighted average)
  const weights = {
    generic: 0.25,      // 25% - Avoid generic AI language
    specificity: 0.30,  // 30% - Include specific details
    professionalism: 0.25, // 25% - Professional tone
    structure: 0.20     // 20% - Proper format
  };
  
  const overallQualityScore = Math.round(
    genericCheck.genericScore * weights.generic +
    specificityCheck.specificityScore * weights.specificity +
    professionalismCheck.professionalismScore * weights.professionalism +
    structureCheck.structureScore * weights.structure
  );
  
  // Determine quality grade
  const qualityGrade = getQualityGrade(overallQualityScore);
  
  // Collect all issues
  const allIssues = [
    ...genericCheck.genericPhrases.map(p => ({
      type: 'generic_language',
      severity: p.severity,
      phrase: p.phrase,
      recommendation: p.replacement
    })),
    ...emotionalCheck.emotionalPhrases.map(p => ({
      type: 'emotional_language',
      severity: p.severity,
      phrase: p.phrase,
      recommendation: 'Remove'
    })),
    ...adversarialCheck.adversarialPhrases.map(p => ({
      type: 'adversarial_language',
      severity: p.severity,
      phrase: p.phrase,
      recommendation: 'Remove'
    })),
    ...specificityCheck.missingRequired.map(item => ({
      type: 'missing_specificity',
      severity: 'high',
      category: item.category,
      recommendation: `Add specific ${item.category}`
    })),
    ...structureCheck.missingElements.map(element => ({
      type: 'missing_structure',
      severity: 'medium',
      element,
      recommendation: `Add ${element}`
    }))
  ];
  
  // Prioritize issues by severity
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const highIssues = allIssues.filter(i => i.severity === 'high');
  const mediumIssues = allIssues.filter(i => i.severity === 'medium');
  
  return {
    // Component scores
    genericScore: genericCheck.genericScore,
    specificityScore: specificityCheck.specificityScore,
    professionalismScore: professionalismCheck.professionalismScore,
    structureScore: structureCheck.structureScore,
    
    // Overall
    overallQualityScore,
    qualityGrade,
    passesQualityCheck: overallQualityScore >= 85,
    
    // Detailed results
    genericLanguage: genericCheck,
    specificity: specificityCheck,
    emotional: emotionalCheck,
    adversarial: adversarialCheck,
    structure: structureCheck,
    
    // Issues summary
    totalIssues: allIssues.length,
    criticalIssues: criticalIssues.length,
    highIssues: highIssues.length,
    mediumIssues: mediumIssues.length,
    allIssues,
    
    // Recommendations
    recommendations: [
      ...genericCheck.recommendations,
      ...specificityCheck.recommendations,
      ...professionalismCheck.recommendations,
      ...structureCheck.recommendations
    ].slice(0, 10), // Top 10 recommendations
    
    // Pass/fail
    mustRegenerate: criticalIssues.length > 0 || overallQualityScore < 70,
    shouldRegenerate: highIssues.length > 3 || overallQualityScore < 85,
    readyToSend: overallQualityScore >= 85 && criticalIssues.length === 0
  };
}

/**
 * Get quality grade from score
 */
function getQualityGrade(score) {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

/**
 * Generate quality improvement suggestions
 * @param {Object} qualityReport - Quality assessment results
 * @returns {Array} - Prioritized suggestions
 */
function generateImprovementSuggestions(qualityReport) {
  const suggestions = [];
  
  // Critical issues first
  if (qualityReport.criticalIssues > 0) {
    suggestions.push({
      priority: 'critical',
      category: 'Language',
      suggestion: `Remove ${qualityReport.criticalIssues} critical language issues before sending`,
      impact: 'high'
    });
  }
  
  // Generic language
  if (qualityReport.genericScore < 90) {
    suggestions.push({
      priority: 'high',
      category: 'Specificity',
      suggestion: 'Replace generic phrases with specific details (dates, amounts, claim numbers)',
      impact: 'high'
    });
  }
  
  // Specificity
  if (qualityReport.specificityScore < 85) {
    suggestions.push({
      priority: 'high',
      category: 'Details',
      suggestion: 'Add missing specific elements: ' + qualityReport.specificity.missingRequired.map(r => r.category).join(', '),
      impact: 'high'
    });
  }
  
  // Structure
  if (qualityReport.structureScore < 75) {
    suggestions.push({
      priority: 'medium',
      category: 'Format',
      suggestion: 'Improve letter structure: ' + qualityReport.structure.missingElements.slice(0, 3).join(', '),
      impact: 'medium'
    });
  }
  
  // Professionalism
  if (qualityReport.professionalismScore < 95) {
    suggestions.push({
      priority: 'high',
      category: 'Tone',
      suggestion: 'Remove emotional or adversarial language to maintain professional tone',
      impact: 'high'
    });
  }
  
  return suggestions.slice(0, 5); // Top 5 suggestions
}

// ============================================================================
// DATABASE INTEGRATION
// ============================================================================

/**
 * Save quality metrics to database
 * @param {string} documentId - Document ID
 * @param {Object} qualityReport - Quality assessment results
 */
async function saveQualityMetrics(documentId, qualityReport) {
  try {
    const supabase = getSupabaseAdmin();
    
    await supabase
      .from('quality_metrics')
      .insert({
        document_id: documentId,
        
        // Generic language
        generic_phrase_count: qualityReport.genericLanguage.genericPhraseCount,
        generic_phrases: qualityReport.genericLanguage.genericPhrases,
        generic_score: qualityReport.genericScore,
        
        // Specificity
        has_specific_dates: qualityReport.specificity.specificityResults.dates?.found || false,
        has_specific_amounts: qualityReport.specificity.specificityResults.amounts?.found || false,
        has_policy_references: qualityReport.specificity.specificityResults.policyNumbers?.found || false,
        has_claim_numbers: qualityReport.specificity.specificityResults.claimNumbers?.found || false,
        specificity_score: qualityReport.specificityScore,
        
        // Professional language
        has_emotional_language: qualityReport.emotional.hasEmotionalLanguage,
        emotional_phrases: qualityReport.emotional.emotionalPhrases,
        has_adversarial_language: qualityReport.adversarial.hasAdversarialLanguage,
        adversarial_phrases: qualityReport.adversarial.adversarialPhrases,
        professionalism_score: qualityReport.professionalismScore,
        
        // Structure
        has_proper_format: qualityReport.structure.passesCheck,
        has_clear_request: qualityReport.structure.checks.hasClearRequest,
        has_deadline: qualityReport.structure.checks.hasDeadline,
        structure_score: qualityReport.structureScore,
        
        // Overall
        overall_quality_score: qualityReport.overallQualityScore,
        quality_grade: qualityReport.qualityGrade,
        passes_quality_check: qualityReport.passesQualityCheck,
        
        // Issues
        issues: qualityReport.allIssues,
        recommendations: qualityReport.recommendations,
        
        created_at: new Date().toISOString()
      });
    
    console.log('Quality metrics saved to database');
  } catch (error) {
    console.error('Failed to save quality metrics:', error);
  }
}

/**
 * Get quality statistics
 * @returns {Object} - Quality statistics
 */
async function getQualityStatistics() {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
      .from('quality_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return {
        totalAssessments: 0,
        averageQualityScore: 0,
        averageGenericScore: 0,
        averageSpecificityScore: 0,
        averageProfessionalismScore: 0,
        passRate: 0
      };
    }
    
    const totalAssessments = data.length;
    const averageQualityScore = data.reduce((sum, m) => sum + (m.overall_quality_score || 0), 0) / totalAssessments;
    const averageGenericScore = data.reduce((sum, m) => sum + (m.generic_score || 0), 0) / totalAssessments;
    const averageSpecificityScore = data.reduce((sum, m) => sum + (m.specificity_score || 0), 0) / totalAssessments;
    const averageProfessionalismScore = data.reduce((sum, m) => sum + (m.professionalism_score || 0), 0) / totalAssessments;
    const passCount = data.filter(m => m.passes_quality_check).length;
    const passRate = (passCount / totalAssessments) * 100;
    
    return {
      totalAssessments,
      averageQualityScore: Math.round(averageQualityScore),
      averageGenericScore: Math.round(averageGenericScore),
      averageSpecificityScore: Math.round(averageSpecificityScore),
      averageProfessionalismScore: Math.round(averageProfessionalismScore),
      passRate: Math.round(passRate),
      meetsTarget: averageQualityScore >= 85
    };
  } catch (error) {
    console.error('Failed to get quality statistics:', error);
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  assessQuality,
  detectGenericLanguage,
  assessSpecificity,
  detectEmotionalLanguage,
  detectAdversarialLanguage,
  assessStructure,
  assessProfessionalism,
  generateImprovementSuggestions,
  saveQualityMetrics,
  getQualityStatistics,
  getQualityGrade,
  GENERIC_AI_PHRASES,
  EMOTIONAL_LANGUAGE,
  ADVERSARIAL_LANGUAGE,
  SPECIFICITY_CHECKS
};
