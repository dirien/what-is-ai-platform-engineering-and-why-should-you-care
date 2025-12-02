import React from 'react';

const ModelDetailModal = ({ model, info, onClose }) => {
  if (!model) return null;

  const modelId = model.id || 'Unknown Model';
  const ownedBy = model.owned_by || 'Unknown';
  const created = model.created ? new Date(model.created).toLocaleDateString() : 'N/A';

  const litellmParams = info?.litellm_params || {};
  const modelInfo = info?.model_info || {};
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
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-charcoal-900/40 backdrop-blur-sm" aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div
          className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-soft-lg transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Accent bar */}
          <div className={`h-1.5 ${getProviderAccent(provider)}`}></div>

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-charcoal-900 font-display mb-2" title={modelId}>
                  {modelId}
                </h3>
                <p className="text-charcoal-500 font-medium">{provider}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="badge badge-success">Active</span>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-charcoal-400 hover:text-charcoal-600 hover:bg-charcoal-100 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Model details */}
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                  <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  Basic Information
                </h4>
                <div className="bg-cream-100 rounded-xl p-4 space-y-3">
                  {providerModel && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-charcoal-500">Model Path</span>
                      <span className="text-sm text-charcoal-900 font-mono bg-white px-2 py-1 rounded">{providerModel}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-charcoal-500">Owned By</span>
                    <span className="text-sm text-charcoal-900">{ownedBy}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-charcoal-500">Created</span>
                    <span className="text-sm text-charcoal-900">{created}</span>
                  </div>
                  {apiBase && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-charcoal-500">API Base</span>
                      <span className="text-sm text-charcoal-900 font-mono truncate ml-4 max-w-xs" title={apiBase}>{apiBase}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Model Parameters */}
              {Object.keys(litellmParams).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                    <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Model Parameters
                  </h4>
                  <div className="bg-cream-100 rounded-xl p-4">
                    <pre className="text-xs text-charcoal-700 overflow-x-auto font-mono">
                      {JSON.stringify(litellmParams, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Model Info */}
              {Object.keys(modelInfo).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                    <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Model Information
                  </h4>
                  <div className="bg-cream-100 rounded-xl p-4">
                    <pre className="text-xs text-charcoal-700 overflow-x-auto font-mono">
                      {JSON.stringify(modelInfo, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Raw Model Data */}
              <div>
                <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                  <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                  Raw Model Data
                </h4>
                <div className="bg-cream-100 rounded-xl p-4">
                  <pre className="text-xs text-charcoal-700 overflow-x-auto font-mono">
                    {JSON.stringify(model, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-cream-100 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-primary"
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
