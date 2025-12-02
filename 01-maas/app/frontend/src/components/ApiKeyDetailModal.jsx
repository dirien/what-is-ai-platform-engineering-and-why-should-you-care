import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ApiKeyDetailModal = ({ apiKey, onClose, onKeyRegenerated }) => {
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);
  const [calculatedSpend, setCalculatedSpend] = useState(0);
  const [copiedExample, setCopiedExample] = useState(null);

  // Fetch spend data when modal opens
  useEffect(() => {
    if (apiKey) {
      fetchSpendData();
    }
  }, [apiKey]);

  const fetchSpendData = async () => {
    try {
      const [logsResponse, modelInfoResponse] = await Promise.all([
        axios.get('/api/spend/logs').catch(() => ({ data: [] })),
        axios.get('/api/model-info').catch(() => ({ data: { data: [] } }))
      ]);

      const logs = logsResponse.data || [];
      const modelInfoData = modelInfoResponse.data?.data || [];

      // Build pricing map
      const pricingMap = new Map();
      modelInfoData.forEach(m => {
        const modelName = m.model_name || m.model_info?.id;
        if (modelName) {
          pricingMap.set(modelName, {
            inputCostPerToken: m.model_info?.input_cost_per_token || 0,
            outputCostPerToken: m.model_info?.output_cost_per_token || 0
          });
        }
      });

      // Calculate spend from logs
      const calculateSpend = (log) => {
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
      };

      // Filter logs for this key and calculate total spend
      const keyLogs = logs.filter(log =>
        log.api_key === apiKey.id || (log.api_key && apiKey.id && log.api_key.includes(apiKey.id.substring(0, 16)))
      );

      const totalSpend = keyLogs.reduce((sum, log) => sum + calculateSpend(log), 0);
      setCalculatedSpend(totalSpend);
    } catch (err) {
      console.error('Error fetching spend data:', err);
    }
  };

  if (!apiKey) return null;

  // Safe access to models array
  const models = apiKey.models || [];
  const keyName = apiKey.name || 'Unnamed Key';

  // Fallback copy function that works over HTTP
  const copyToClipboard = async (text, exampleType) => {
    try {
      // Try modern clipboard API first (requires HTTPS)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for HTTP: use execCommand
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedExample(exampleType);
      setTimeout(() => setCopiedExample(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setRegenerateError(null);

    try {
      // Delete the old key
      await axios.delete(`/api/keys/${encodeURIComponent(apiKey.id)}`);

      // Create a new key with the same configuration
      const response = await axios.post('/api/keys', {
        name: keyName,
        models: models
      });

      // Call the callback with the new key
      if (onKeyRegenerated) {
        onKeyRegenerated(response.data);
      }

      setShowRegenerateConfirm(false);
      onClose();
    } catch (err) {
      console.error('Error regenerating key:', err);
      setRegenerateError(err.response?.data?.error || 'Failed to regenerate API key');
    } finally {
      setIsRegenerating(false);
    }
  };

  const defaultModel = models[0] || 'gpt-3.5-turbo';

  const curlExample = `curl https://api.acme-inc.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey.key}" \\
  -d '{
    "model": "${defaultModel}",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ]
  }'`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    api_key="${apiKey.key}",
    base_url="https://api.acme-inc.com/v1"
)

response = client.chat.completions.create(
    model="${defaultModel}",
    messages=[
        {"role": "user", "content": "Hello, how are you?"}
    ]
)

print(response.choices[0].message.content)`;

  const nodeExample = `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: '${apiKey.key}',
  baseURL: 'https://api.acme-inc.com/v1'
});

async function main() {
  const completion = await client.chat.completions.create({
    model: '${defaultModel}',
    messages: [
      { role: 'user', content: 'Hello, how are you?' }
    ]
  });

  console.log(completion.choices[0].message.content);
}

main();`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal panel */}
        <div
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-primary-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white">{keyName}</h3>
                <p className="text-primary-50 text-sm mt-1">API Key Details</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-primary-50 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-6 max-h-[70vh] overflow-y-auto">
            {/* Key Info */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Information
              </h4>
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Created</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {new Date(apiKey.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Last Used</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {apiKey.last_used ? new Date(apiKey.last_used).toLocaleDateString() : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Spend</p>
                  <p className="text-sm text-gray-900 font-medium">${calculatedSpend.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Models</p>
                  <p className="text-sm text-gray-900 font-medium">{models.length} model(s)</p>
                </div>
              </div>
            </div>

            {/* Allowed Models */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Allowed Models
              </h4>
              <div className="bg-gray-50 rounded-lg p-4">
                {models.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {models.map((model) => (
                      <span
                        key={model}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No models assigned. This key has access to all models.</p>
                )}
              </div>
            </div>

            {/* Usage Examples */}
            <div className="mb-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Usage Examples
              </h4>

              {/* cURL Example */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-gray-700">cURL</h5>
                  <button
                    onClick={() => copyToClipboard(curlExample, 'curl')}
                    className="text-xs text-primary hover:text-primary-700"
                  >
                    {copiedExample === 'curl' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-charcoal-900 text-charcoal-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all" style={{ WebkitTextFillColor: 'inherit' }}>
                  <code className="text-charcoal-100" style={{ background: 'none', WebkitTextFillColor: 'inherit' }}>{curlExample}</code>
                </pre>
              </div>

              {/* Python Example */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-gray-700">Python</h5>
                  <button
                    onClick={() => copyToClipboard(pythonExample, 'python')}
                    className="text-xs text-primary hover:text-primary-700"
                  >
                    {copiedExample === 'python' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-charcoal-900 text-charcoal-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all" style={{ WebkitTextFillColor: 'inherit' }}>
                  <code className="text-charcoal-100" style={{ background: 'none', WebkitTextFillColor: 'inherit' }}>{pythonExample}</code>
                </pre>
              </div>

              {/* Node.js Example */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-gray-700">Node.js</h5>
                  <button
                    onClick={() => copyToClipboard(nodeExample, 'node')}
                    className="text-xs text-primary hover:text-primary-700"
                  >
                    {copiedExample === 'node' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-charcoal-900 text-charcoal-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all" style={{ WebkitTextFillColor: 'inherit' }}>
                  <code className="text-charcoal-100" style={{ background: 'none', WebkitTextFillColor: 'inherit' }}>{nodeExample}</code>
                </pre>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:w-auto sm:text-sm"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setShowRegenerateConfirm(true)}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate Key
            </button>
          </div>
        </div>

        {/* Regenerate Confirmation Dialog */}
        {showRegenerateConfirm && (
          <div className="fixed inset-0 z-[60] overflow-y-auto" onClick={() => setShowRegenerateConfirm(false)}>
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              <div
                className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 sm:mx-0 sm:h-10 sm:w-10">
                      <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg leading-6 font-medium text-gray-900">Regenerate API Key</h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Are you sure you want to regenerate this API key? This will:
                        </p>
                        <ul className="mt-2 text-sm text-gray-500 list-disc list-inside space-y-1">
                          <li>Immediately invalidate the current key</li>
                          <li>Generate a new key with the same configuration</li>
                          <li>Require you to update the key in all applications</li>
                        </ul>
                        <p className="mt-2 text-sm font-semibold text-orange-600">
                          This action cannot be undone!
                        </p>
                      </div>
                      {regenerateError && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-700">{regenerateError}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRegenerating ? 'Regenerating...' : 'Regenerate Key'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRegenerateConfirm(false)}
                    disabled={isRegenerating}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiKeyDetailModal;
