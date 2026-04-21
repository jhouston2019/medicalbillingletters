const { normalizePlan } = require("./_billingSnapshot");

/**
 * Expiry derived from normalized plan (single → no expiry; monthly/premier → 30d; annual/enterprise → 365d).
 * @param {string} planRaw metadata or stored plan_type
 * @returns {string|null} ISO 8601 or null
 */
function expiresAtForPlan(planRaw) {
  const p = normalizePlan(planRaw);
  if (p === "single") return null;
  if (p === "monthly" || p === "premier") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString();
  }
  if (p === "annual" || p === "enterprise") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 365);
    return d.toISOString();
  }
  return null;
}

module.exports = { expiresAtForPlan };
