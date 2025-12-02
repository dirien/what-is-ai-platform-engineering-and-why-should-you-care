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
      // Fetch both keys and spend logs
      const [keysResponse, logsResponse] = await Promise.all([
        axios.get('/api/keys'),
        axios.get('/api/spend/logs').catch(() => ({ data: [] }))
      ]);

      const keys = keysResponse.data.data || [];
      const logs = logsResponse.data || [];

      // Build model map from keys (for key count)
      const modelMap = new Map();

      keys.forEach(key => {
        const keyModels = key.models || [];
        keyModels.forEach(modelName => {
          if (modelMap.has(modelName)) {
            const existing = modelMap.get(modelName);
            existing.keyCount += 1;
            existing.keys.push(key);
          } else {
            modelMap.set(modelName, {
              name: modelName,
              keyCount: 1,
              totalSpend: 0, // Will be calculated from logs
              keys: [key]
            });
          }
        });
      });

      // Calculate per-model spend from logs
      // LiteLLM uses model_group for the model name in logs
      logs.forEach(log => {
        const modelName = log.model_group || log.model || log.model_id;
        if (modelName && modelMap.has(modelName)) {
          const existing = modelMap.get(modelName);
          existing.totalSpend += typeof log.spend === 'number' ? log.spend : 0;
        }
      });

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

  // Get accent color based on model provider
  const getModelAccent = (modelName) => {
    const name = modelName.toLowerCase();
    if (name.includes('gpt') || name.includes('openai')) return 'bg-sage-500';
    if (name.includes('claude') || name.includes('anthropic')) return 'bg-primary-500';
    if (name.includes('gemini') || name.includes('google')) return 'bg-sky-500';
    if (name.includes('mistral')) return 'bg-violet-500';
    if (name.includes('llama')) return 'bg-amber-500';
    return 'bg-charcoal-400';
  };

  if (loading) {
    return (
      <div className="p-8 lg:p-10">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
            <p className="mt-4 text-charcoal-500 font-medium">Loading subscriptions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 lg:p-10">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-start">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-red-800">Error loading subscriptions</h3>
              <p className="mt-1 text-red-700">{error}</p>
              <button
                onClick={fetchSubscribedModels}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-10">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-charcoal-900 font-display mb-2">Subscriptions</h1>
        <p className="text-charcoal-500">Models you have access to through your API keys</p>
      </div>

      {/* Stats Bar */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="stat-card">
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-charcoal-500 font-medium">Total Models</p>
              <p className="text-lg font-bold text-charcoal-900">{models.length}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-10 h-10 rounded-lg bg-sage-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-charcoal-500 font-medium">Total Usage</p>
              <p className="text-lg font-bold text-charcoal-900">
                ${models.reduce((sum, m) => sum + m.totalSpend, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchSubscribedModels}
          className="btn-ghost flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Subscriptions Grid */}
      {models.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-charcoal-200">
          <div className="w-16 h-16 rounded-2xl bg-charcoal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-800 mb-1">No subscriptions</h3>
          <p className="text-charcoal-500 max-w-sm mx-auto">
            You don't have any API keys with model access yet. Create an API key to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {models.map((model) => (
            <div
              key={model.name}
              onClick={() => setSelectedModel(model)}
              className="card cursor-pointer overflow-hidden group"
            >
              {/* Accent bar */}
              <div className={`h-1 ${getModelAccent(model.name)} opacity-80`}></div>

              <div className="p-6">
                {/* Header */}
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-charcoal-900 mb-2 group-hover:text-primary-600 transition-colors" title={model.name}>
                    {model.name}
                  </h3>
                  <span className="badge badge-success">
                    Subscribed
                  </span>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-charcoal-50 flex items-center justify-center">
                        <svg className="h-4 w-4 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                        </svg>
                      </div>
                      <span className="text-sm text-charcoal-500">API Keys</span>
                    </div>
                    <span className="text-sm font-semibold text-charcoal-900">{model.keyCount}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-charcoal-50 flex items-center justify-center">
                        <svg className="h-4 w-4 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-sm text-charcoal-500">Total Usage</span>
                    </div>
                    <span className="text-sm font-semibold text-charcoal-900">
                      ${model.totalSpend.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* View Details Link */}
                <div className="mt-5 pt-4 border-t border-charcoal-100">
                  <span className="text-sm font-medium text-primary-500 group-hover:text-primary-600 flex items-center gap-1.5 justify-center transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    View Usage Details
                  </span>
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
