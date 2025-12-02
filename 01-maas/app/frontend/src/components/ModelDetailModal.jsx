import React, { useState } from 'react';

const ModelDetailModal = ({ model, info, onClose }) => {
  const [copiedCode, setCopiedCode] = useState(false);

  if (!model) return null;

  const modelId = model.id || 'Unknown Model';
  const ownedBy = model.owned_by || 'Unknown';

  // Get model info - from the info object which contains public model hub data
  const mode = info?.mode || 'chat';
  const maxInputTokens = info?.max_input_tokens;
  const maxOutputTokens = info?.max_output_tokens;
  const inputCostPerToken = info?.input_cost_per_token || 0;
  const outputCostPerToken = info?.output_cost_per_token || 0;
  const supportedOpenAIParams = info?.supported_openai_params || [];
  const providers = info?.providers || [ownedBy];

  // Calculate cost per 1M tokens
  const inputCostPer1M = inputCostPerToken * 1000000;
  const outputCostPer1M = outputCostPerToken * 1000000;

  // Format cost display
  const formatCost = (cost) => {
    if (cost === 0 || cost === null || cost === undefined) return 'Not specified';
    if (cost < 0.01) return `$${cost.toFixed(6)}`;
    return `$${cost.toFixed(2)}`;
  };

  // Get capabilities based on model info
  const getCapabilities = () => {
    const caps = [];
    if (info?.supports_vision) caps.push('Vision');
    if (info?.supports_function_calling) caps.push('Function Calling');
    if (info?.supports_web_search) caps.push('Web Search');
    if (info?.supports_reasoning) caps.push('Reasoning');
    if (info?.supports_parallel_function_calling) caps.push('Parallel Function Calling');
    return caps;
  };
  const capabilities = getCapabilities();

  const getProvider = () => {
    if (providers && providers.length > 0) {
      return providers[0];
    }
    return ownedBy;
  };

  const provider = getProvider();

  // Generate Python usage example
  const pythonUsageExample = `import openai

client = openai.OpenAI(
    api_key="your_api_key",
    base_url="http://0.0.0.0:4000"  # Your LiteLLM Proxy URL
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {
            "role": "user",
            "content": "Hello, how are you?"
        }
    ]
)

print(response.choices[0].message.content)`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(pythonUsageExample);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
              {/* Model Overview */}
              <div>
                <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                  <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  Model Overview
                </h4>
                <div className="bg-cream-100 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Model Group:</span>
                      <span className="text-sm text-charcoal-900">{modelId}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Mode:</span>
                      <span className="text-sm text-charcoal-900">{mode}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Providers:</span>
                      <div className="flex flex-wrap gap-2">
                        {providers.map((p, idx) => (
                          <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-charcoal-700 border border-charcoal-200">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Token & Cost Information */}
              <div>
                <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                  <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Token & Cost Information
                </h4>
                <div className="bg-cream-100 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Max Input Tokens:</span>
                      <span className="text-sm text-charcoal-900">{maxInputTokens ? maxInputTokens.toLocaleString() : 'Not specified'}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Max Output Tokens:</span>
                      <span className="text-sm text-charcoal-900">{maxOutputTokens ? maxOutputTokens.toLocaleString() : 'Not specified'}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Input Cost per 1M Tokens:</span>
                      <span className="text-sm text-charcoal-900 font-semibold">{formatCost(inputCostPer1M)}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-charcoal-500 block mb-1">Output Cost per 1M Tokens:</span>
                      <span className="text-sm text-charcoal-900 font-semibold">{formatCost(outputCostPer1M)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Capabilities */}
              <div>
                <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                  <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  Capabilities
                </h4>
                <div className="bg-cream-100 rounded-xl p-4">
                  {capabilities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {capabilities.map((cap, idx) => (
                        <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-sage-100 text-sage-700">
                          {cap}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-charcoal-500">No special capabilities listed</p>
                  )}
                </div>
              </div>

              {/* Supported OpenAI Parameters */}
              {supportedOpenAIParams.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                    <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Supported OpenAI Parameters
                  </h4>
                  <div className="bg-cream-100 rounded-xl p-4">
                    <div className="flex flex-wrap gap-2">
                      {supportedOpenAIParams.map((param, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-white text-charcoal-600 border border-charcoal-200">
                          {param}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Usage Example */}
              <div>
                <h4 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wider mb-3 flex items-center">
                  <svg className="h-4 w-4 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                  Usage Example
                </h4>
                <div className="bg-charcoal-900 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-charcoal-800 border-b border-charcoal-700">
                    <span className="text-xs font-medium text-charcoal-400">Python</span>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-charcoal-400 hover:text-white transition-colors rounded hover:bg-charcoal-700"
                    >
                      {copiedCode ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-sage-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-sm text-charcoal-100 overflow-x-auto font-mono leading-relaxed">
                    <code>{pythonUsageExample.split('\n').map((line, i) => {
                      // Simple syntax highlighting
                      const highlightedLine = line
                        .replace(/\b(import|from|print)\b/g, '<span class="text-violet-400">$1</span>')
                        .replace(/\b(openai|client|response)\b/g, '<span class="text-sky-400">$1</span>')
                        .replace(/"([^"]+)"/g, '<span class="text-sage-400">"$1"</span>')
                        .replace(/#.+$/g, '<span class="text-charcoal-500">$&</span>');
                      return (
                        <span key={i} dangerouslySetInnerHTML={{ __html: highlightedLine + '\n' }} />
                      );
                    })}</code>
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
