import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ModelUsageModal from './ModelUsageModal';

const Subscriptions = () => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    fetchSubscribedModels();
  }, []);

  const fetchSubscribedModels = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all API keys
      const keysResponse = await axios.get('/api/keys');
      const keys = keysResponse.data.data || [];

      // Extract unique models from all keys and calculate stats
      const modelMap = new Map();

      keys.forEach(key => {
        const keyModels = key.models || [];
        keyModels.forEach(modelName => {
          if (modelMap.has(modelName)) {
            const existing = modelMap.get(modelName);
            existing.keyCount += 1;
            existing.totalSpend += key.usage_count || 0;
            existing.keys.push(key);
          } else {
            modelMap.set(modelName, {
              name: modelName,
              keyCount: 1,
              totalSpend: key.usage_count || 0,
              keys: [key]
            });
          }
        });
      });

      // Convert map to array and sort by total spend
      const modelsArray = Array.from(modelMap.values()).sort(
        (a, b) => b.totalSpend - a.totalSpend
      );

      setModels(modelsArray);
    } catch (err) {
      console.error('Error fetching subscribed models:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch subscribed models');
    } finally {
      setLoading(false);
    }
  };

  // Get color scheme based on model provider
  const getModelColors = (modelName) => {
    const name = modelName.toLowerCase();
    if (name.includes('gpt') || name.includes('openai')) return 'from-green-400 to-green-600';
    if (name.includes('claude') || name.includes('anthropic')) return 'from-orange-400 to-orange-600';
    if (name.includes('gemini') || name.includes('google')) return 'from-blue-400 to-blue-600';
    if (name.includes('mistral')) return 'from-purple-400 to-purple-600';
    if (name.includes('llama')) return 'from-yellow-400 to-yellow-600';
    return 'from-gray-400 to-gray-600';
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading subscriptions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-red-800">Error loading subscriptions</h3>
              <p className="mt-2 text-red-700">{error}</p>
              <button
                onClick={fetchSubscribedModels}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Subscriptions</h1>
        <p className="text-gray-600">Models you have access to through your API keys</p>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <p className="text-sm text-blue-600 font-medium">
              Total Models: <span className="text-blue-900 font-bold">{models.length}</span>
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <p className="text-sm text-green-600 font-medium">
              Total Spend: <span className="text-green-900 font-bold">
                ${models.reduce((sum, m) => sum + m.totalSpend, 0).toFixed(2)}
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={fetchSubscribedModels}
          className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No subscriptions</h3>
          <p className="mt-1 text-gray-500">
            You don't have any API keys with model access yet.
          </p>
          <p className="mt-1 text-gray-500">
            Create an API key to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {models.map((model) => (
            <div
              key={model.name}
              onClick={() => setSelectedModel(model)}
              className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200 cursor-pointer transform hover:scale-105"
            >
              <div className={`h-2 bg-gradient-to-r ${getModelColors(model.name)}`}></div>

              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1" title={model.name}>
                    {model.name}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Subscribed
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      <span className="text-sm text-gray-600">API Keys</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{model.keyCount}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-gray-600">Total Spend</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      ${model.totalSpend.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-center text-sm text-blue-600 font-medium">
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    View Usage Details
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Model Usage Modal */}
      {selectedModel && (
        <ModelUsageModal
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
        />
      )}
    </div>
  );
};

export default Subscriptions;
