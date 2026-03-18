/**
 * INSURANCE RISK GUARDRAILS ENGINE
 * 
 * ⚠️ SAFETY LOCK — DO NOT MODIFY ⚠️
 * This system intentionally refuses certain scenarios.
 * Removing guardrails constitutes a safety regression.
 * 
 * CRITICAL SAFETY SYSTEM
 * 
 * This module enforces hard stops for dangerous scenarios.
 * When triggered, system MUST refuse to generate output.
 * 
 * HARD STOP CONDITIONS:
 * - Fraud investigations
 * - EUO requests
 * - Recorded statement requests
 * - Reservation of rights
 * - Bad faith allegations
 * - Attorney involvement
 * - Litigation threats
 * - High-risk commercial claims
 * - Subrogation disputes
 * - Coverage disputes
 * 
 * REGRESSION WARNING:
 * This file enforces safety boundaries.
 * Any loosening increases user harm risk.
 * 
 * allowSelfResponse = false → NO OUTPUT
 * escalationRequired = true → ATTORNEY REQUIRED
 */

/**
 * Risk levels
 */
const RISK_LEVELS = {
  SAFE: 'safe',
  CAUTION: 'caution',
  HIGH_RISK: 'high_risk',
  CRITICAL: 'critical',
  HARD_STOP: 'hard_stop'
};

/**
 * Hard stop conditions for medical billing disputes
 */
const HARD_STOP_CONDITIONS = {
  COLLECTIONS_LAWSUIT: {
    code: 'COLLECTIONS_LAWSUIT',
    message: 'Collections lawsuit filed - Attorney required',
    explanation: 'Once a lawsuit has been filed, you need legal representation. Responding without an attorney can result in default judgment and wage garnishment.',
    severity: 'critical',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  FRAUD_INVESTIGATION: {
    code: 'FRAUD_INVESTIGATION',
    message: 'Fraud investigation - Attorney required immediately',
    explanation: 'Medical billing fraud allegations can result in criminal charges. You need an attorney who specializes in healthcare fraud defense.',
    severity: 'critical',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  MEDICARE_FRAUD: {
    code: 'MEDICARE_FRAUD',
    message: 'Medicare/Medicaid fraud investigation - Federal attorney required',
    explanation: 'Federal healthcare fraud investigations are serious. You need an attorney experienced in federal healthcare law.',
    severity: 'critical',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  WAGE_GARNISHMENT: {
    code: 'WAGE_GARNISHMENT',
    message: 'Wage garnishment initiated - Attorney required',
    explanation: 'Once wage garnishment has started, you need legal help to stop it and negotiate a settlement.',
    severity: 'critical',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  HIGH_VALUE_BILL: {
    code: 'HIGH_VALUE_BILL',
    message: 'Bill over $100,000 - Attorney consultation recommended',
    explanation: 'For bills over $100,000, the stakes are too high for DIY dispute. An attorney can negotiate better settlements and protect your assets.',
    severity: 'high',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  HOSPITAL_LIEN: {
    code: 'HOSPITAL_LIEN',
    message: 'Hospital lien filed - Attorney required',
    explanation: 'Hospital liens can affect your ability to sell property or receive insurance settlements. You need legal representation.',
    severity: 'high',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  CLASS_ACTION: {
    code: 'CLASS_ACTION',
    message: 'Potential class action - Attorney consultation required',
    explanation: 'If this is a systemic billing issue affecting multiple patients, you may be part of a class action lawsuit. Consult an attorney.',
    severity: 'high',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  HIPAA_VIOLATION: {
    code: 'HIPAA_VIOLATION',
    message: 'HIPAA violation alleged - Attorney required',
    explanation: 'HIPAA violations are complex legal matters. You need an attorney who specializes in healthcare privacy law.',
    severity: 'high',
    allowSelfResponse: false,
    escalationRequired: true,
    requiresAttorney: true
  },
  
  EMERGENCY_CARE_DISPUTE: {
    code: 'EMERGENCY_CARE_DISPUTE',
    message: 'Emergency care billing dispute detected',
    explanation: 'Emergency care has special protections under the No Surprises Act. This tool can help, but complex cases may require attorney review.',
    severity: 'medium',
    allowSelfResponse: true,
    escalationRequired: false,
    requiresAttorney: false
  },
  
  OUT_OF_NETWORK_SURPRISE: {
    code: 'OUT_OF_NETWORK_SURPRISE',
    message: 'Surprise billing detected',
    explanation: 'The No Surprises Act provides protections. This tool can help you dispute surprise bills, but complex cases may need attorney review.',
    severity: 'medium',
    allowSelfResponse: true,
    escalationRequired: false,
    requiresAttorney: false
  }
};

/**
 * Evaluate risk and determine if hard stop is required
 * @param {Object} params - Risk evaluation parameters
 * @returns {Object} - Risk assessment with hard stop decision
 */
function evaluateRisk(params) {
  const {
    phase,
    classification,
    userChecks,
    letterText
  } = params;
  
  const triggeredConditions = [];
  let highestSeverity = RISK_LEVELS.SAFE;
  
  // Check letter text for medical billing risk indicators
  if (letterText) {
    const lowerText = letterText.toLowerCase();
    
    // Collections lawsuit
    if (lowerText.includes('lawsuit') || lowerText.includes('summons') || lowerText.includes('court') || 
        lowerText.includes('legal action') || lowerText.includes('judgment')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.COLLECTIONS_LAWSUIT);
      highestSeverity = RISK_LEVELS.HARD_STOP;
    }
    
    // Fraud investigation
    if (lowerText.includes('fraud') || lowerText.includes('false claim') || 
        lowerText.includes('misrepresentation') || lowerText.includes('identity theft')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.FRAUD_INVESTIGATION);
      highestSeverity = RISK_LEVELS.HARD_STOP;
    }
    
    // Medicare/Medicaid fraud
    if ((lowerText.includes('medicare') || lowerText.includes('medicaid')) && 
        (lowerText.includes('fraud') || lowerText.includes('investigation') || lowerText.includes('cms'))) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.MEDICARE_FRAUD);
      highestSeverity = RISK_LEVELS.HARD_STOP;
    }
    
    // Wage garnishment
    if (lowerText.includes('wage garnishment') || lowerText.includes('bank levy') || 
        lowerText.includes('asset seizure')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.WAGE_GARNISHMENT);
      highestSeverity = RISK_LEVELS.HARD_STOP;
    }
    
    // Hospital lien
    if (lowerText.includes('hospital lien') || lowerText.includes('medical lien') || 
        lowerText.includes('lien filed')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.HOSPITAL_LIEN);
      if (highestSeverity !== RISK_LEVELS.HARD_STOP) {
        highestSeverity = RISK_LEVELS.HIGH_RISK;
      }
    }
    
    // Class action
    if (lowerText.includes('class action') || lowerText.includes('multiple patients') || 
        lowerText.includes('systemic billing')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.CLASS_ACTION);
      if (highestSeverity !== RISK_LEVELS.HARD_STOP) {
        highestSeverity = RISK_LEVELS.HIGH_RISK;
      }
    }
    
    // HIPAA violation
    if (lowerText.includes('hipaa violation') || lowerText.includes('privacy breach') || 
        lowerText.includes('unauthorized disclosure')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.HIPAA_VIOLATION);
      if (highestSeverity !== RISK_LEVELS.HARD_STOP) {
        highestSeverity = RISK_LEVELS.HIGH_RISK;
      }
    }
    
    // High value bill (over $100,000)
    const amountMatch = letterText.match(/\$[\d,]+/g);
    if (amountMatch) {
      amountMatch.forEach(amount => {
        const numericAmount = parseInt(amount.replace(/[$,]/g, ''));
        if (numericAmount >= 100000) {
          triggeredConditions.push(HARD_STOP_CONDITIONS.HIGH_VALUE_BILL);
          if (highestSeverity !== RISK_LEVELS.HARD_STOP) {
            highestSeverity = RISK_LEVELS.HIGH_RISK;
          }
        }
      });
    }
    
    // Out-of-network surprise billing
    if (lowerText.includes('out of network') || lowerText.includes('surprise bill') || 
        lowerText.includes('balance bill')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.OUT_OF_NETWORK_SURPRISE);
      if (highestSeverity === RISK_LEVELS.SAFE) {
        highestSeverity = RISK_LEVELS.CAUTION;
      }
    }
    
    // Emergency care dispute
    if (lowerText.includes('emergency room') || lowerText.includes('emergency department') || 
        lowerText.includes('life-threatening') || lowerText.includes('ambulance')) {
      triggeredConditions.push(HARD_STOP_CONDITIONS.EMERGENCY_CARE_DISPUTE);
      if (highestSeverity === RISK_LEVELS.SAFE) {
        highestSeverity = RISK_LEVELS.CAUTION;
      }
    }
  }
  
  // Determine if hard stop is required
  const hardStop = triggeredConditions.length > 0;
  const allowSelfResponse = !hardStop;
  const escalationRequired = hardStop;
  const requiresAttorney = triggeredConditions.some(c => c.requiresAttorney);
  
  return {
    hardStop,
    allowSelfResponse,
    escalationRequired,
    requiresAttorney,
    riskLevel: highestSeverity,
    triggeredConditions,
    primaryCondition: triggeredConditions[0] || null,
    message: triggeredConditions.length > 0 
      ? triggeredConditions[0].message 
      : 'No hard stop conditions detected.',
    allMessages: triggeredConditions.map(c => c.message)
  };
}

/**
 * Get risk-appropriate guidance
 */
function getRiskGuidance(riskAssessment) {
  if (riskAssessment.hardStop) {
    return {
      canProceed: false,
      recommendation: 'STOP - Professional representation required',
      actions: [
        'Do not respond to this letter without professional guidance',
        'Contact an attorney immediately',
        'Do not provide any statements or information',
        'Preserve all documentation'
      ],
      warnings: [
        'Self-response may harm your claim',
        'Legal or financial consequences possible',
        'Professional representation is critical'
      ]
    };
  }
  
  if (riskAssessment.riskLevel === RISK_LEVELS.HIGH_RISK) {
    return {
      canProceed: false,
      recommendation: 'Professional consultation strongly recommended',
      actions: [
        'Consult with an attorney or insurance professional',
        'Do not respond without professional review',
        'Understand your rights and obligations'
      ],
      warnings: [
        'This situation involves complex issues',
        'Self-response carries significant risk',
        'Professional guidance recommended'
      ]
    };
  }
  
  return {
    canProceed: true,
    recommendation: 'Procedural response may be appropriate',
    actions: [
      'Review the analysis carefully',
      'Provide only requested information',
      'Keep response brief and factual',
      'Do not over-disclose'
    ],
    warnings: [
      'Do not provide narrative explanations',
      'Do not volunteer additional information',
      'Consider professional review for complex situations'
    ]
  };
}

/**
 * Format hard stop message for display
 */
function formatHardStopMessage(riskAssessment) {
  if (!riskAssessment.hardStop) {
    return null;
  }
  
  const primaryCondition = riskAssessment.primaryCondition;
  
  return {
    title: '⛔ PROFESSIONAL REPRESENTATION REQUIRED',
    code: primaryCondition.code,
    severity: primaryCondition.severity,
    message: primaryCondition.message,
    additionalConditions: riskAssessment.triggeredConditions.slice(1).map(c => c.message),
    actions: [
      'Contact an attorney immediately',
      'Do not respond without professional guidance',
      'Do not provide statements or information',
      'Preserve all documentation'
    ],
    resources: [
      'State Bar Association - Attorney referral',
      'Insurance Commissioner - Consumer assistance',
      'Legal Aid - If you qualify for free legal help'
    ]
  };
}

module.exports = {
  evaluateRisk,
  getRiskGuidance,
  formatHardStopMessage,
  HARD_STOP_CONDITIONS,
  RISK_LEVELS
};

