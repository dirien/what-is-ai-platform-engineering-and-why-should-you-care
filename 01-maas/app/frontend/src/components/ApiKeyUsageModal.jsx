import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#E07A5F', '#81B29A', '#3D405B', '#F2CC8F', '#F4A261', '#E76F51'];

const ApiKeyUsageModal = ({ apiKey, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [usageData, setUsageData] = useState(null);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    if (apiKey) {
      fetchUsageData();
    }
  }, [apiKey, timeRange]);

  const fetchUsageData = async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (timeRange) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Fetch spend logs and model info (for pricing) in parallel
      const [logsResponse, modelInfoResponse] = await Promise.all([
        axios.get('/api/spend/logs', {
          params: {
            api_key: apiKey.id,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
          }
        }),
        axios.get('/api/model-info').catch(() => ({ data: { data: [] } }))
      ]);

      const logs = logsResponse.data || [];

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

      // Filter logs for this specific key
      const keyLogs = logs.filter(log =>
        log.api_key === apiKey.id || log.api_key?.includes(apiKey.id?.substring(0, 16))
      );

      // Calculate summary
      let totalSpend = 0;
      let totalTokens = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      keyLogs.forEach(log => {
        // Calculate spend from tokens using pricing when log.spend is 0
        totalSpend += calculateSpend(log);
        totalTokens += log.total_tokens || log.usage?.total_tokens || 0;
        inputTokens += log.prompt_tokens || log.usage?.prompt_tokens || 0;
        outputTokens += log.completion_tokens || log.usage?.completion_tokens || 0;
      });

      const totalRequests = keyLogs.length;
      const avgCostPerRequest = totalRequests > 0 ? totalSpend / totalRequests : 0;

      // Group by day for chart
      const spendByDayMap = new Map();
      keyLogs.forEach(log => {
        const date = new Date(log.startTime || log.created_at || log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const existing = spendByDayMap.get(date) || { date, spend: 0, requests: 0, tokens: 0 };
        existing.spend += calculateSpend(log);
        existing.requests += 1;
        existing.tokens += log.total_tokens || log.usage?.total_tokens || 0;
        spendByDayMap.set(date, existing);
      });
      const spendByDay = Array.from(spendByDayMap.values()).slice(-30);

      // Group by model
      const spendByModelMap = new Map();
      keyLogs.forEach(log => {
        const model = log.model_group || log.model || log.model_id || 'Unknown';
        const existing = spendByModelMap.get(model) || { model, spend: 0, requests: 0, tokens: 0 };
        existing.spend += calculateSpend(log);
        existing.requests += 1;
        existing.tokens += log.total_tokens || log.usage?.total_tokens || 0;
        spendByModelMap.set(model, existing);
      });
      const spendByModel = Array.from(spendByModelMap.values())
        .sort((a, b) => b.spend - a.spend);

      // Recent requests
      const recentRequests = keyLogs
        .slice(-10)
        .reverse()
        .map(log => ({
          date: new Date(log.startTime || log.created_at || log.timestamp).toLocaleString(),
          model: log.model_group || log.model || log.model_id || 'Unknown',
          tokens: log.total_tokens || log.usage?.total_tokens || 0,
          spend: calculateSpend(log)
        }));

      setUsageData({
        summary: {
          totalSpend,
          totalTokens,
          totalRequests,
          avgCostPerRequest,
          inputTokens,
          outputTokens
        },
        spendByDay,
        spendByModel,
        recentRequests
      });
    } catch (err) {
      console.error('Error fetching usage data:', err);
      // Set default empty data instead of error for better UX
      setUsageData({
        summary: {
          totalSpend: apiKey.usage_count || 0,
          totalTokens: 0,
          totalRequests: 0,
          avgCostPerRequest: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        spendByDay: [],
        spendByModel: [],
        recentRequests: []
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(6)}`;
  };

  const formatNumber = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  if (!apiKey) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-charcoal-900/40 backdrop-blur-sm" aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div
          className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-soft-lg transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">{apiKey.name}</h3>
                <p className="text-primary-100 text-sm mt-1">Usage & Cost Analytics</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  <option value="7d" className="text-charcoal-900">Last 7 days</option>
                  <option value="30d" className="text-charcoal-900">Last 30 days</option>
                  <option value="90d" className="text-charcoal-900">Last 90 days</option>
                </select>
                <button
                  onClick={onClose}
                  className="text-white hover:text-primary-100 transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
                  <p className="mt-4 text-charcoal-500 font-medium">Loading usage data...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200">
                    <p className="text-xs text-primary-600 font-medium mb-1">Total Spend</p>
                    <p className="text-2xl font-bold text-primary-900">
                      {formatCurrency(usageData?.summary?.totalSpend || 0)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-sage-50 to-sage-100 rounded-xl p-4 border border-sage-200">
                    <p className="text-xs text-sage-600 font-medium mb-1">Total Tokens</p>
                    <p className="text-2xl font-bold text-sage-900">
                      {formatNumber(usageData?.summary?.totalTokens || 0)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
                    <p className="text-xs text-amber-600 font-medium mb-1">Requests</p>
                    <p className="text-2xl font-bold text-amber-900">
                      {formatNumber(usageData?.summary?.totalRequests || 0)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium mb-1">Avg Cost/Request</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {formatCurrency(usageData?.summary?.avgCostPerRequest || 0)}
                    </p>
                  </div>
                </div>

                {/* Token Breakdown */}
                <div className="mb-6 p-4 bg-charcoal-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-charcoal-500">Input Tokens: </span>
                      <span className="font-semibold text-sage-600">{formatNumber(usageData?.summary?.inputTokens || 0)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-charcoal-500">Output Tokens: </span>
                      <span className="font-semibold text-primary-600">{formatNumber(usageData?.summary?.outputTokens || 0)}</span>
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="h-3 bg-charcoal-200 rounded-full overflow-hidden flex">
                        {usageData?.summary?.totalTokens > 0 && (
                          <>
                            <div
                              className="bg-sage-500 h-full"
                              style={{ width: `${(usageData.summary.inputTokens / usageData.summary.totalTokens) * 100}%` }}
                            />
                            <div
                              className="bg-primary-500 h-full"
                              style={{ width: `${(usageData.summary.outputTokens / usageData.summary.totalTokens) * 100}%` }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Spend Over Time */}
                  <div className="bg-white rounded-xl border border-charcoal-100 p-4">
                    <h4 className="text-sm font-semibold text-charcoal-700 mb-4">Spend Over Time</h4>
                    {usageData?.spendByDay?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={usageData.spendByDay}>
                          <defs>
                            <linearGradient id="colorSpendKey" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#E07A5F" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#E07A5F" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#6B7280" />
                          <YAxis tick={{ fontSize: 10 }} stroke="#6B7280" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                          <Tooltip
                            formatter={(value) => [`$${value.toFixed(4)}`, 'Spend']}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                          />
                          <Area type="monotone" dataKey="spend" stroke="#E07A5F" strokeWidth={2} fill="url(#colorSpendKey)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-charcoal-400 text-sm">
                        No spend data available
                      </div>
                    )}
                  </div>

                  {/* Spend by Model */}
                  <div className="bg-white rounded-xl border border-charcoal-100 p-4">
                    <h4 className="text-sm font-semibold text-charcoal-700 mb-4">Spend by Model</h4>
                    {usageData?.spendByModel?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={usageData.spendByModel} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis type="number" tick={{ fontSize: 10 }} stroke="#6B7280" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                          <YAxis dataKey="model" type="category" tick={{ fontSize: 10 }} stroke="#6B7280" width={80} />
                          <Tooltip
                            formatter={(value) => [`$${value.toFixed(4)}`, 'Spend']}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                          />
                          <Bar dataKey="spend" fill="#81B29A" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-charcoal-400 text-sm">
                        No model data available
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Requests */}
                <div className="bg-white rounded-xl border border-charcoal-100 p-4">
                  <h4 className="text-sm font-semibold text-charcoal-700 mb-4">Recent Requests</h4>
                  {usageData?.recentRequests?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-charcoal-100">
                            <th className="text-left py-2 px-3 text-xs font-semibold text-charcoal-500 uppercase">Date</th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-charcoal-500 uppercase">Model</th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-charcoal-500 uppercase">Tokens</th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-charcoal-500 uppercase">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usageData.recentRequests.map((req, index) => (
                            <tr key={index} className="border-b border-charcoal-50 hover:bg-cream-50">
                              <td className="py-2 px-3 text-sm text-charcoal-600">{req.date}</td>
                              <td className="py-2 px-3">
                                <span className="badge badge-neutral text-xs">{req.model}</span>
                              </td>
                              <td className="py-2 px-3 text-sm text-charcoal-700 text-right font-mono">{formatNumber(req.tokens)}</td>
                              <td className="py-2 px-3 text-sm text-charcoal-900 text-right font-semibold">{formatCurrency(req.spend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-charcoal-400 text-sm">
                      No recent requests found. Make API calls with this key to see usage data.
                    </div>
                  )}
                </div>

                {/* Key Info */}
                <div className="mt-6 p-4 bg-cream-100 rounded-xl">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-charcoal-500">API Key: </span>
                      <code className="font-mono text-charcoal-700 bg-white px-2 py-0.5 rounded">{apiKey.key}</code>
                    </div>
                    <div>
                      <span className="text-charcoal-500">Created: </span>
                      <span className="text-charcoal-700">{new Date(apiKey.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-charcoal-500">Subscribed Models: </span>
                      <span className="text-charcoal-700">{apiKey.models?.join(', ') || 'None'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-cream-100 flex justify-end">
            <button
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

export default ApiKeyUsageModal;
