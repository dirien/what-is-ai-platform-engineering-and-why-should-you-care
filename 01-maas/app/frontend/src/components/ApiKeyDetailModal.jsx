import React, { useState } from 'react';
import axios from 'axios';

const ApiKeyDetailModal = ({ apiKey, onClose, onKeyRegenerated }) => {
  const [showFullKey, setShowFullKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);

  if (!apiKey) return null;

  const displayKey = showFullKey
    ? apiKey.key
    : `${apiKey.key.substring(0, 12)}...${apiKey.key.substring(apiKey.key.length - 4)}`;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setRegenerateError(null);

    try {
      // Delete the old key
      await axios.delete(`/api/keys/${encodeURIComponent(apiKey.id)}`);

      // Create a new key with the same configuration
      const response = await axios.post('/api/keys', {
        name: apiKey.name,
        models: apiKey.models
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

  const curlExample = `curl https://api.acme-inc.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey.key}" \\
  -d '{
    "model": "${apiKey.models[0] || 'gpt-3.5-turbo'}",
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
    model="${apiKey.models[0] || 'gpt-3.5-turbo'}",
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
    model: '${apiKey.models[0] || 'gpt-3.5-turbo'}',
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
                <h3 className="text-2xl font-bold text-white">{apiKey.name}</h3>
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
            {/* API Key Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                  <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  API Key
                </h4>
                <button
                  onClick={() => setShowRegenerateConfirm(true)}
                  className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-1"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate Key
                </button>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <code className="text-sm font-mono text-gray-900 break-all">{displayKey}</code>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setShowFullKey(!showFullKey)}
                      className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                    >
                      {showFullKey ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(apiKey.key)}
                      className="px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary-600 transition-colors flex items-center gap-1"
                    >
                      {copied ? (
                        <>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

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
                  <p className="text-sm text-gray-900 font-medium">${typeof apiKey.usage_count === 'number' ? apiKey.usage_count.toFixed(4) : '0.0000'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Models</p>
                  <p className="text-sm text-gray-900 font-medium">{apiKey.models.length} model(s)</p>
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
                <div className="flex flex-wrap gap-2">
                  {apiKey.models.map((model) => (
                    <span
                      key={model}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
                    >
                      {model}
                    </span>
                  ))}
                </div>
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
                    onClick={() => copyToClipboard(curlExample)}
                    className="text-xs text-primary hover:text-primary-700"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                  <code>{curlExample}</code>
                </pre>
              </div>

              {/* Python Example */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-gray-700">Python</h5>
                  <button
                    onClick={() => copyToClipboard(pythonExample)}
                    className="text-xs text-primary hover:text-primary-700"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                  <code>{pythonExample}</code>
                </pre>
              </div>

              {/* Node.js Example */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-gray-700">Node.js</h5>
                  <button
                    onClick={() => copyToClipboard(nodeExample)}
                    className="text-xs text-primary hover:text-primary-700"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                  <code>{nodeExample}</code>
                </pre>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:w-auto sm:text-sm"
            >
              Close
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
