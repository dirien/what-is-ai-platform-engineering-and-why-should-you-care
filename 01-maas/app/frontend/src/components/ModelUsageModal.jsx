import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ModelUsageModal = ({ model, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [usageData, setUsageData] = useState(null);
  const [spendLogs, setSpendLogs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (model) {
      fetchUsageData();
    }
  }, [model]);

  const fetchUsageData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate date range for last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      // Fetch spend logs and model info (for pricing) in parallel
      const [logsResponse, modelInfoResponse] = await Promise.all([
        axios.get('/api/spend/logs', {
          params: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            summarize: false
          }
        }),
        axios.get('/api/model-info').catch(() => ({ data: { data: [] } }))
      ]);

      // Build pricing map from model info
      const modelInfoData = modelInfoResponse.data?.data || [];
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

      // Helper function to calculate spend from log
      const calculateSpend = (log) => {
        // Use log.spend if available and > 0
        if (typeof log.spend === 'number' && log.spend > 0) {
          return log.spend;
        }

        // Calculate from tokens using pricing
        const modelName = log.model_group || log.model || log.model_id;
        const pricing = pricingMap.get(modelName);
        if (pricing && (pricing.inputCostPerToken > 0 || pricing.outputCostPerToken > 0)) {
          const inputToks = log.prompt_tokens || log.usage?.prompt_tokens || 0;
          const outputToks = log.completion_tokens || log.usage?.completion_tokens || 0;
          return (inputToks * pricing.inputCostPerToken) + (outputToks * pricing.outputCostPerToken);
        }

        return 0;
      };

      // Filter logs for this specific model
      // LiteLLM uses model_group for the model name in spend logs
      const modelLogs = (logsResponse.data || []).filter(
        log => log.model_group === model.name || log.model === model.name || log.model_id === model.name
      );

      // Update logs with calculated spend for display
      const logsWithSpend = modelLogs.map(log => ({
        ...log,
        calculatedSpend: calculateSpend(log)
      }));

      setSpendLogs(logsWithSpend);

      // Calculate aggregated usage data
      const totalSpend = logsWithSpend.reduce((sum, log) => sum + log.calculatedSpend, 0);
      const totalRequests = logsWithSpend.length;
      const totalTokens = logsWithSpend.reduce((sum, log) =>
        sum + (log.total_tokens || log.usage?.total_tokens || 0), 0
      );

      setUsageData({
        totalSpend,
        totalRequests,
        totalTokens,
        avgCostPerRequest: totalRequests > 0 ? totalSpend / totalRequests : 0
      });
    } catch (err) {
      console.error('Error fetching usage data:', err);

      // If spend logs are not available, show model data without spend logs
      setUsageData({
        totalSpend: model.totalSpend || 0,
        totalRequests: 0,
        totalTokens: 0,
        avgCostPerRequest: 0
      });
      setSpendLogs([]);

      // Only set error if it's a real error, not just missing endpoint
      if (err.response?.status !== 404 && err.response?.status !== 500) {
        setError('Spend logs are not available. Showing basic model information.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!model) return null;

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
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white">{model.name}</h3>
                <p className="text-blue-100 text-sm mt-1">Usage & Cost Analytics</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-blue-100 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-6 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <p className="mt-4 text-gray-600">Loading usage data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-700">{error}</p>
              </div>
            ) : null}

            {!loading && spendLogs.length === 0 && !error && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-primary mt-0.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-primary-800">
                      <strong>Note:</strong> Detailed usage logs are not available. Make sure your LiteLLM proxy is running at <code className="bg-blue-100 px-1 rounded">http://localhost:4000</code> to see real-time usage data.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!loading && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-600 font-medium mb-1">Total Spend</p>
                        <p className="text-2xl font-bold text-blue-900">
                          ${usageData?.totalSpend?.toFixed(4) || '0.00'}
                        </p>
                      </div>
                      <div className="bg-blue-500 rounded-full p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-600 font-medium mb-1">Total Requests</p>
                        <p className="text-2xl font-bold text-green-900">
                          {usageData?.totalRequests?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <div className="bg-green-500 rounded-full p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-purple-600 font-medium mb-1">Total Tokens</p>
                        <p className="text-2xl font-bold text-purple-900">
                          {usageData?.totalTokens?.toLocaleString() || '0'}
                        </p>
                      </div>
                      <div className="bg-purple-500 rounded-full p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-orange-600 font-medium mb-1">Avg Cost/Request</p>
                        <p className="text-2xl font-bold text-orange-900">
                          ${usageData?.avgCostPerRequest?.toFixed(6) || '0.000000'}
                        </p>
                      </div>
                      <div className="bg-orange-500 rounded-full p-3">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Model Information */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Model Information
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Model Name</p>
                      <p className="text-sm text-gray-900 font-medium">{model.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Keys with Access</p>
                      <p className="text-sm text-gray-900 font-medium">{model.keyCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Total Spend</p>
                      <p className="text-sm text-gray-900 font-medium">${model.totalSpend?.toFixed(4) || '0.0000'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Last 30 Days</p>
                      <p className="text-sm text-gray-900 font-medium">${usageData?.totalSpend?.toFixed(4) || '0.0000'}</p>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent Activity (Last 10 Requests)
                  </h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    {spendLogs.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        No usage data found for the last 30 days
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tokens</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {spendLogs.slice(0, 10).map((log, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {new Date(log.startTime || log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {(log.total_tokens || log.usage?.total_tokens || 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  ${(log.calculatedSpend || log.spend || 0).toFixed(6)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                                  {log.api_key ? `${log.api_key.substring(0, 12)}...` : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelUsageModal;
