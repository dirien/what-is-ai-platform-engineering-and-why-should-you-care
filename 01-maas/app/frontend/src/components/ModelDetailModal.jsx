import React from 'react';

const ModelDetailModal = ({ model, info, onClose }) => {
  if (!model) return null;

  const modelId = model.id || 'Unknown Model';
  const ownedBy = model.owned_by || 'Unknown';
  // model.created is already in milliseconds from Date.now()
  const created = model.created ? new Date(model.created).toLocaleDateString() : 'N/A';

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
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal panel */}
        <div
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div className={`h-3 bg-gradient-to-r ${getProviderColors(provider)}`}></div>

          {/* Close button */}
          <div className="absolute top-4 right-4">
            <button
              onClick={onClose}
              className="bg-white rounded-full p-2 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary shadow-lg"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                {/* Model title and status */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2" title={modelId}>
                      {modelId}
                    </h3>
                    <p className="text-lg text-gray-600">{provider}</p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </div>

                {/* Model details grid */}
                <div className="space-y-6">
                  {/* Basic Information */}
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Basic Information
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      {providerModel && (
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">Model Path:</span>
                          <span className="text-sm text-gray-900 font-mono">{providerModel}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Owned By:</span>
                        <span className="text-sm text-gray-900">{ownedBy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">Created:</span>
                        <span className="text-sm text-gray-900">{created}</span>
                      </div>
                      {apiBase && (
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">API Base:</span>
                          <span className="text-sm text-gray-900 font-mono truncate ml-2" title={apiBase}>{apiBase}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Model Parameters */}
                  {Object.keys(litellmParams).length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                        <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Model Parameters
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <pre className="text-xs text-gray-800 overflow-x-auto">
                          {JSON.stringify(litellmParams, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Model Info */}
                  {Object.keys(modelInfo).length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                        <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Model Information
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <pre className="text-xs text-gray-800 overflow-x-auto">
                          {JSON.stringify(modelInfo, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Raw Model Data */}
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                      Raw Model Data
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <pre className="text-xs text-gray-800 overflow-x-auto">
                        {JSON.stringify(model, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelDetailModal;
