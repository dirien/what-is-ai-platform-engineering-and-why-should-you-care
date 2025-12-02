import React from 'react';

const ModelCard = ({ model, info, onClick }) => {
  const modelId = model.id || 'Unknown Model';
  const ownedBy = model.owned_by || 'Unknown';
  const providers = info?.providers || [ownedBy];
  const provider = providers[0] || ownedBy;

  // Get cost info
  const inputCostPerToken = info?.input_cost_per_token || 0;
  const outputCostPerToken = info?.output_cost_per_token || 0;
  const inputCostPer1M = inputCostPerToken * 1000000;
  const outputCostPer1M = outputCostPerToken * 1000000;

  // Get model capabilities
  const mode = info?.mode || 'chat';
  const maxTokens = info?.max_tokens || info?.max_input_tokens;

  // Format cost display
  const formatCost = (cost) => {
    if (cost === 0) return '-';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  // Refined provider accent colors
  const getProviderAccent = (provider) => {
    const providerLower = provider.toLowerCase();
    if (providerLower.includes('openai')) return 'bg-sage-500';
    if (providerLower.includes('anthropic')) return 'bg-primary-500';
    if (providerLower.includes('cohere')) return 'bg-violet-500';
    if (providerLower.includes('google')) return 'bg-sky-500';
    if (providerLower.includes('hugging')) return 'bg-amber-500';
    return 'bg-charcoal-400';
  };

  // Get mode badge style
  const getModeStyle = (mode) => {
    switch (mode) {
      case 'chat':
        return 'bg-sky-100 text-sky-700';
      case 'completion':
        return 'bg-violet-100 text-violet-700';
      case 'embedding':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-charcoal-100 text-charcoal-700';
    }
  };

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer overflow-hidden group"
    >
      {/* Subtle accent line */}
      <div className={`h-1 ${getProviderAccent(provider)} opacity-80`}></div>

      <div className="p-5">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-lg font-semibold text-charcoal-900 break-words flex-1 min-w-0 group-hover:text-primary-600 transition-colors leading-tight" title={modelId}>
              {modelId}
            </h3>
            <span className="badge badge-success flex-shrink-0 text-xs">
              Active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-charcoal-500">{provider}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getModeStyle(mode)}`}>
              {mode}
            </span>
          </div>
        </div>

        {/* Cost Information - Key decision factor */}
        <div className="bg-cream-100 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-xs text-charcoal-500 mb-0.5">Input / 1M</p>
              <p className="text-sm font-semibold text-charcoal-800">{formatCost(inputCostPer1M)}</p>
            </div>
            <div className="w-px h-8 bg-charcoal-200"></div>
            <div className="text-center flex-1">
              <p className="text-xs text-charcoal-500 mb-0.5">Output / 1M</p>
              <p className="text-sm font-semibold text-charcoal-800">{formatCost(outputCostPer1M)}</p>
            </div>
            {maxTokens && (
              <>
                <div className="w-px h-8 bg-charcoal-200"></div>
                <div className="text-center flex-1">
                  <p className="text-xs text-charcoal-500 mb-0.5">Context</p>
                  <p className="text-sm font-semibold text-charcoal-800">{(maxTokens / 1000).toFixed(0)}K</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Capabilities badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {info?.supports_function_calling && (
            <span className="text-xs px-2 py-0.5 rounded bg-sage-100 text-sage-700">Functions</span>
          )}
          {info?.supports_vision && (
            <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700">Vision</span>
          )}
          {info?.supports_tool_choice && (
            <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-700">Tools</span>
          )}
          {!info?.supports_function_calling && !info?.supports_vision && !info?.supports_tool_choice && (
            <span className="text-xs px-2 py-0.5 rounded bg-charcoal-100 text-charcoal-500">Standard</span>
          )}
        </div>

        {/* View Details Link */}
        <div className="pt-3 border-t border-charcoal-100">
          <span className="text-sm font-medium text-primary-500 group-hover:text-primary-600 flex items-center gap-1.5 transition-colors">
            View details
            <svg className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
};

export default ModelCard;
