import React from 'react';

const ModelCard = ({ model, info, onClick }) => {
  const modelId = model.id || 'Unknown Model';
  const ownedBy = model.owned_by || 'Unknown';
  const created = model.created ? new Date(model.created).toLocaleDateString() : 'N/A';

  const litellmParams = info?.litellm_params || {};
  const apiBase = litellmParams.api_base;
  const providerModel = litellmParams.model;

  const getProvider = () => {
    if (providerModel) {
      const parts = providerModel.split('/');
      if (parts.length > 1) return parts[0];
    }
    if (apiBase) {
      if (apiBase.includes('openai')) return 'OpenAI';
      if (apiBase.includes('anthropic')) return 'Anthropic';
      if (apiBase.includes('cohere')) return 'Cohere';
      if (apiBase.includes('huggingface')) return 'Hugging Face';
    }
    return ownedBy;
  };

  const provider = getProvider();

  // Refined provider accent colors - lighter, more elegant
  const getProviderAccent = (provider) => {
    const providerLower = provider.toLowerCase();
    if (providerLower.includes('openai')) return 'bg-sage-500';
    if (providerLower.includes('anthropic')) return 'bg-primary-500';
    if (providerLower.includes('cohere')) return 'bg-violet-500';
    if (providerLower.includes('google')) return 'bg-sky-500';
    if (providerLower.includes('hugging')) return 'bg-amber-500';
    return 'bg-charcoal-400';
  };

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer overflow-hidden group"
    >
      {/* Subtle accent line */}
      <div className={`h-1 ${getProviderAccent(provider)} opacity-80`}></div>

      <div className="p-6">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-lg font-semibold text-charcoal-900 break-words flex-1 min-w-0 group-hover:text-primary-600 transition-colors" title={modelId}>
              {modelId}
            </h3>
            <span className="badge badge-success flex-shrink-0">
              Active
            </span>
          </div>
          <p className="text-sm text-charcoal-500 font-medium">{provider}</p>
        </div>

        {/* Details */}
        <div className="space-y-3">
          {providerModel && (
            <div className="flex items-start">
              <div className="w-8 h-8 rounded-lg bg-charcoal-50 flex items-center justify-center mr-3 flex-shrink-0">
                <svg className="h-4 w-4 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-charcoal-400 font-medium mb-0.5">Model Path</p>
                <p className="text-sm text-charcoal-700 font-mono truncate" title={providerModel}>
                  {providerModel}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start">
            <div className="w-8 h-8 rounded-lg bg-charcoal-50 flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="h-4 w-4 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-charcoal-400 font-medium mb-0.5">Created</p>
              <p className="text-sm text-charcoal-700">{created}</p>
            </div>
          </div>

          {apiBase && (
            <div className="flex items-start">
              <div className="w-8 h-8 rounded-lg bg-charcoal-50 flex items-center justify-center mr-3 flex-shrink-0">
                <svg className="h-4 w-4 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-charcoal-400 font-medium mb-0.5">API Base</p>
                <p className="text-sm text-charcoal-700 truncate" title={apiBase}>
                  {apiBase}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* View Details Link */}
        <div className="mt-5 pt-4 border-t border-charcoal-100">
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
