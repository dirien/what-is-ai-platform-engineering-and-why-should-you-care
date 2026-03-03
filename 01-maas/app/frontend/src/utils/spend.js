/**
 * Shared spend calculation utilities used across multiple components.
 */

/**
 * Build a pricing Map from model info data returned by /api/model-info.
 * @param {Array} modelInfoData - Array of model info objects
 * @returns {Map<string, {inputCostPerToken: number, outputCostPerToken: number}>}
 */
export function buildPricingMap(modelInfoData) {
  const pricingMap = new Map();
  modelInfoData.forEach(m => {
    const modelName = m.model_name || m.model_info?.id;
    if (modelName) {
      pricingMap.set(modelName, {
        inputCostPerToken: m.model_info?.input_cost_per_token || 0,
        outputCostPerToken: m.model_info?.output_cost_per_token || 0,
      });
    }
  });
  return pricingMap;
}

/**
 * Calculate the spend for a single log entry.
 * Uses log.spend if available and > 0, otherwise calculates from tokens + pricing.
 * @param {Object} log - A spend log entry
 * @param {Map} pricingMap - Pricing map built by buildPricingMap()
 * @returns {number} The calculated spend
 */
export function calculateSpend(log, pricingMap) {
  if (typeof log.spend === 'number' && log.spend > 0) {
    return log.spend;
  }
  const modelName = log.model_group || log.model || log.model_id;
  const pricing = pricingMap.get(modelName);
  if (pricing && (pricing.inputCostPerToken > 0 || pricing.outputCostPerToken > 0)) {
    const inputToks = log.prompt_tokens || log.usage?.prompt_tokens || 0;
    const outputToks = log.completion_tokens || log.usage?.completion_tokens || 0;
    return (inputToks * pricing.inputCostPerToken) + (outputToks * pricing.outputCostPerToken);
  }
  return 0;
}

/**
 * Format a currency value with appropriate precision.
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

/**
 * Format a large number with K/M suffixes.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}
