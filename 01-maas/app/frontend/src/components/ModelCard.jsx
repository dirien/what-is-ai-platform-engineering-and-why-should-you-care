import React from 'react';

const ModelCard = ({ model, info, onClick }) => {
  const modelId = model.id || 'Unknown Model';
  const ownedBy = model.owned_by || 'Unknown';
  // model.created is already in milliseconds from Date.now()
  const created = model.created ? new Date(model.created).toLocaleDateString() : 'N/A';
  
  // Extract additional info if available
  const litellmParams = info?.litellm_params || {};
  const modelInfo = info?.model_info || {};
  const apiBase = litellmParams.api_base;
  const providerModel = litellmParams.model;

  // Determine provider from model name or api_base
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

  // Get provider color scheme
  const getProviderColors = (provider) => {
    const providerLower = provider.toLowerCase();
    if (providerLower.includes('openai')) return 'from-green-400 to-green-600';
    if (providerLower.includes('anthropic')) return 'from-orange-400 to-orange-600';
    if (providerLower.includes('cohere')) return 'from-purple-400 to-purple-600';
    if (providerLower.includes('google')) return 'from-blue-400 to-blue-600';
    if (providerLower.includes('hugging')) return 'from-yellow-400 to-yellow-600';
    return 'from-gray-400 to-gray-600';
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200 cursor-pointer transform hover:scale-105"
    >
      <div className={`h-2 bg-gradient-to-r ${getProviderColors(provider)}`}></div>
      
      <div className="p-6">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 break-words flex-1 min-w-0" title={modelId}>
              {modelId}
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 flex-shrink-0 whitespace-nowrap">
              Active
            </span>
          </div>
          <p className="text-sm text-gray-500">{provider}</p>
        </div>

        <div className="space-y-3">
          {providerModel && (
            <div className="flex items-start">
              <svg className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className="text-xs text-gray-500">Model Path</p>
                <p className="text-sm text-gray-900 font-mono truncate" title={providerModel}>
                  {providerModel}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start">
            <svg className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-xs text-gray-500">Created</p>
              <p className="text-sm text-gray-900">{created}</p>
            </div>
          </div>

          {apiBase && (
            <div className="flex items-start">
              <svg className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">API Base</p>
                <p className="text-sm text-gray-900 truncate" title={apiBase}>
                  {apiBase}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelCard;
