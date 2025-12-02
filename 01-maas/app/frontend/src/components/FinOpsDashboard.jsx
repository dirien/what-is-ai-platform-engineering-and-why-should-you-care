import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

const COLORS = ['#E07A5F', '#81B29A', '#3D405B', '#F2CC8F', '#F4A261', '#E76F51', '#2A9D8F', '#264653'];

const FinOpsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');
  const [dashboardData, setDashboardData] = useState({
    summary: {
      totalSpend: 0,
      totalTokens: 0,
      totalRequests: 0,
      avgCostPerRequest: 0,
      inputTokens: 0,
      outputTokens: 0
    },
    spendByDay: [],
    spendByModel: [],
    spendByKey: [],
    tokensByModel: [],
    modelPricing: []
  });

  const getDateRange = useCallback(() => {
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

    return { startDate, endDate };
  }, [timeRange]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = getDateRange();

      // Fetch spend logs, model info (for pricing), public models (for filtering), and keys in parallel
      // Note: Don't pass dates to backend - filter client-side for more reliable results
      const [spendLogsRes, modelInfoRes, publicModelsRes, keysRes] = await Promise.all([
        axios.get('/api/spend/logs').catch(err => {
          // Ensure we always return an array, not an error object
          console.error('Spend logs fetch error:', err.response?.data || err.message);
          return { data: [] };
        }),
        axios.get('/api/model-info').catch(err => ({ data: { data: [] } })),
        axios.get('/api/public-model-hub').catch(err => ({ data: [] })),
        axios.get('/api/keys').catch(err => ({ data: { data: [] } }))
      ]);

      // Handle both array and object responses - ensure we never process error objects
      let logs = [];
      const responseData = spendLogsRes.data;
      if (Array.isArray(responseData)) {
        logs = responseData;
      } else if (responseData?.data && Array.isArray(responseData.data)) {
        logs = responseData.data;
      } else if (responseData?.logs && Array.isArray(responseData.logs)) {
        logs = responseData.logs;
      } else if (responseData && typeof responseData === 'object' && responseData.error) {
        // This is an error response, not log data - ignore it
        console.warn('Spend logs returned an error:', responseData.error);
        logs = [];
      }

      // Filter logs by date range client-side
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();
      logs = logs.filter(log => {
        const logTime = new Date(log.startTime || log.created_at || log.timestamp).getTime();
        return logTime >= startTime && logTime <= endTime;
      });

      // Get published models only (for filtering)
      const publicModels = publicModelsRes.data || [];
      const publishedModelNames = new Set(publicModels.map(m => m.model_group || m.model_name));
      const keys = keysRes.data?.data || [];

      // Get model info (for pricing) - model_info has accurate pricing data
      const modelInfoData = modelInfoRes.data?.data || modelInfoRes.data || [];

      // Build pricing lookup map by model name/group from model_info
      const pricingMap = new Map();
      modelInfoData.forEach(m => {
        const modelName = m.model_name;
        const pricing = {
          inputCostPerToken: m.model_info?.input_cost_per_token || 0,
          outputCostPerToken: m.model_info?.output_cost_per_token || 0,
          description: m.model_info?.description || ''
        };
        pricingMap.set(modelName, pricing);
      });

      // Helper function to calculate spend from tokens
      const calculateSpend = (log) => {
        // Use model_group if available (LiteLLM includes this), otherwise fall back to model
        const modelGroup = log.model_group || log.model || 'Unknown';
        const pricing = pricingMap.get(modelGroup);

        if (pricing) {
          const inputToks = log.prompt_tokens || log.usage?.prompt_tokens || 0;
          const outputToks = log.completion_tokens || log.usage?.completion_tokens || 0;
          return (inputToks * pricing.inputCostPerToken) + (outputToks * pricing.outputCostPerToken);
        }
        // Fall back to spend value if no pricing found
        return log.spend || 0;
      };

      // Calculate summary metrics
      let totalSpend = 0;
      let totalTokens = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      logs.forEach(log => {
        // Use calculated spend based on tokens and pricing
        totalSpend += calculateSpend(log);
        const logTokens = log.total_tokens || log.usage?.total_tokens || 0;
        totalTokens += logTokens;
        inputTokens += log.prompt_tokens || log.usage?.prompt_tokens || 0;
        outputTokens += log.completion_tokens || log.usage?.completion_tokens || 0;
      });

      const totalRequests = logs.length;
      const avgCostPerRequest = totalRequests > 0 ? totalSpend / totalRequests : 0;

      // Group spend by day
      const spendByDayMap = new Map();
      logs.forEach(log => {
        const date = new Date(log.startTime || log.created_at || log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const existing = spendByDayMap.get(date) || { date, spend: 0, requests: 0, tokens: 0 };
        existing.spend += calculateSpend(log);
        existing.requests += 1;
        existing.tokens += log.total_tokens || log.usage?.total_tokens || 0;
        spendByDayMap.set(date, existing);
      });
      const spendByDay = Array.from(spendByDayMap.values()).slice(-30);

      // Group spend by model (only published models)
      // Use model_group when available (LiteLLM includes this field)
      const spendByModelMap = new Map();
      logs.forEach(log => {
        const model = log.model_group || log.model || log.model_id || 'Unknown';
        // Only include logs for published models
        if (!publishedModelNames.has(model) && publishedModelNames.size > 0) return;
        const existing = spendByModelMap.get(model) || { model, spend: 0, requests: 0, tokens: 0 };
        existing.spend += calculateSpend(log);
        existing.requests += 1;
        existing.tokens += log.total_tokens || log.usage?.total_tokens || 0;
        spendByModelMap.set(model, existing);
      });
      const spendByModel = Array.from(spendByModelMap.values())
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);

      // Group spend by API key
      const spendByKeyMap = new Map();
      logs.forEach(log => {
        const keyId = log.api_key || 'Unknown';
        // Try to find key name from keys list, or use alias from metadata if available
        const keyName = keys.find(k => k.id === keyId)?.name ||
                        log.metadata?.user_api_key_alias ||
                        keyId.substring(0, 16) + '...';
        const existing = spendByKeyMap.get(keyId) || { keyId, keyName, spend: 0, requests: 0, tokens: 0 };
        existing.spend += calculateSpend(log);
        existing.requests += 1;
        existing.tokens += log.total_tokens || log.usage?.total_tokens || 0;
        spendByKeyMap.set(keyId, existing);
      });
      const spendByKey = Array.from(spendByKeyMap.values())
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);

      // Extract model pricing info from model_info (has accurate pricing)
      // Filter to only show published models
      const modelPricing = modelInfoData
        .filter(m => publishedModelNames.has(m.model_name) || publishedModelNames.size === 0)
        .map(m => ({
          name: m.model_name,
          inputCost: (m.model_info?.input_cost_per_token || 0) * 1000000,
          outputCost: (m.model_info?.output_cost_per_token || 0) * 1000000,
          description: m.model_info?.description || '',
          provider: m.litellm_params?.model?.split('/')[0] || m.model_info?.litellm_provider || 'custom'
        }));

      // Prepare tokens by model for pie chart
      const tokensByModel = spendByModel.map(m => ({
        name: m.model,
        value: m.tokens
      }));

      setDashboardData({
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
        spendByKey,
        tokensByModel,
        modelPricing
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      // Extract error message safely, handle object errors
      let errorMessage = 'Failed to fetch dashboard data';
      if (err.response?.data?.error) {
        errorMessage = typeof err.response.data.error === 'string'
          ? err.response.data.error
          : JSON.stringify(err.response.data.error);
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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

  if (loading) {
    return (
      <div className="p-8 lg:p-10">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
            <p className="mt-4 text-charcoal-500 font-medium">Loading FinOps dashboard...</p>
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
              <h3 className="text-lg font-semibold text-red-800">Error loading dashboard</h3>
              <p className="mt-1 text-red-700">{error}</p>
              <button
                onClick={fetchDashboardData}
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

  const { summary, spendByDay, spendByModel, spendByKey, tokensByModel, modelPricing } = dashboardData;
  const hasUsageData = summary.totalRequests > 0;

  return (
    <div className="p-8 lg:p-10">
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-charcoal-900 font-display mb-2">FinOps Dashboard</h1>
          <p className="text-charcoal-500">Track spending, usage, and optimize costs across your AI models</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2.5 bg-white border border-charcoal-200 rounded-xl text-charcoal-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={fetchDashboardData}
            className="btn-secondary flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Getting Started Banner - shown when no usage data */}
      {!hasUsageData && (
        <div className="mb-8 bg-gradient-to-r from-primary-50 to-sage-50 rounded-2xl p-6 border border-primary-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
              <svg className="h-6 w-6 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-charcoal-900 mb-1">Welcome to FinOps</h3>
              <p className="text-charcoal-600 mb-4">
                Start tracking your AI model costs by creating API keys and making requests.
                All usage across your subscriptions will be displayed here automatically.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#" onClick={(e) => { e.preventDefault(); }} className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  Create an API Key
                </a>
                <span className="text-charcoal-300">•</span>
                <a href="#" onClick={(e) => { e.preventDefault(); }} className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                  Subscribe to Models
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
              <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="badge badge-primary">Total Spend</span>
          </div>
          <p className="text-3xl font-bold text-charcoal-900">{formatCurrency(summary.totalSpend)}</p>
          <p className="text-sm text-charcoal-500 mt-1">Last {timeRange.replace('d', ' days')}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sage-100 to-sage-200 flex items-center justify-center">
              <svg className="h-6 w-6 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </div>
            <span className="badge badge-sage">Total Tokens</span>
          </div>
          <p className="text-3xl font-bold text-charcoal-900">{formatNumber(summary.totalTokens)}</p>
          <p className="text-sm text-charcoal-500 mt-1">
            <span className="text-sage-600">{formatNumber(summary.inputTokens)}</span> in / <span className="text-primary-600">{formatNumber(summary.outputTokens)}</span> out
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
              <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <span className="badge badge-amber">Requests</span>
          </div>
          <p className="text-3xl font-bold text-charcoal-900">{formatNumber(summary.totalRequests)}</p>
          <p className="text-sm text-charcoal-500 mt-1">API calls made</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <span className="badge badge-blue">Avg Cost</span>
          </div>
          <p className="text-3xl font-bold text-charcoal-900">{formatCurrency(summary.avgCostPerRequest)}</p>
          <p className="text-sm text-charcoal-500 mt-1">Per request</p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Spend Over Time */}
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <h3 className="text-lg font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            Spend Over Time
          </h3>
          {spendByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={spendByDay}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E07A5F" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#E07A5F" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#6B7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6B7280" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip
                  formatter={(value) => [`$${value.toFixed(4)}`, 'Spend']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                />
                <Area type="monotone" dataKey="spend" stroke="#E07A5F" strokeWidth={2} fill="url(#colorSpend)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-charcoal-400">
              No spend data available for this period
            </div>
          )}
        </div>

        {/* Spend by Model */}
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <h3 className="text-lg font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-sage-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
            </svg>
            Spend by Model
          </h3>
          {spendByModel.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={spendByModel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#6B7280" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <YAxis dataKey="model" type="category" tick={{ fontSize: 11 }} stroke="#6B7280" width={100} />
                <Tooltip
                  formatter={(value) => [`$${value.toFixed(4)}`, 'Spend']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                />
                <Bar dataKey="spend" fill="#81B29A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-charcoal-400">
              No model data available for this period
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Token Distribution Pie */}
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
          <h3 className="text-lg font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
            Token Distribution
          </h3>
          {tokensByModel.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={tokensByModel}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name.substring(0, 10)}${name.length > 10 ? '...' : ''} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {tokensByModel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatNumber(value), 'Tokens']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-charcoal-400">
              No token data available
            </div>
          )}
        </div>

        {/* Spend by API Key */}
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50 lg:col-span-2">
          <h3 className="text-lg font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            Spend by API Key
          </h3>
          {spendByKey.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-charcoal-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Key</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Spend</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Requests</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Tokens</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {spendByKey.map((key, index) => {
                    const maxSpend = Math.max(...spendByKey.map(k => k.spend));
                    const percentage = maxSpend > 0 ? (key.spend / maxSpend) * 100 : 0;
                    return (
                      <tr key={key.keyId} className="border-b border-charcoal-50 hover:bg-cream-50">
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-charcoal-700">{key.keyName}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-semibold text-charcoal-900">{formatCurrency(key.spend)}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-charcoal-600">{formatNumber(key.requests)}</td>
                        <td className="py-3 px-4 text-right text-charcoal-600">{formatNumber(key.tokens)}</td>
                        <td className="py-3 px-4 w-32">
                          <div className="w-full bg-charcoal-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: COLORS[index % COLORS.length]
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-charcoal-400">
              No API key usage data available
            </div>
          )}
        </div>
      </div>

      {/* Model Pricing Table */}
      <div className="bg-white rounded-2xl p-6 shadow-soft border border-charcoal-100/50">
        <h3 className="text-lg font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
          <svg className="h-5 w-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
          Model Pricing
          <span className="ml-2 text-xs font-normal text-charcoal-400">(per 1M tokens)</span>
        </h3>
        {modelPricing.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-charcoal-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Model</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Provider</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Input Cost</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Output Cost</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-charcoal-500 uppercase">Description</th>
                </tr>
              </thead>
              <tbody>
                {modelPricing.map((model, index) => (
                  <tr key={model.name} className="border-b border-charcoal-50 hover:bg-cream-50">
                    <td className="py-3 px-4">
                      <span className="font-semibold text-charcoal-900">{model.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="badge badge-neutral capitalize">{model.provider}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-mono text-sage-600">${model.inputCost.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-mono text-primary-600">${model.outputCost.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-4 text-charcoal-500 text-sm max-w-xs truncate">
                      {model.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-charcoal-400">
            No model pricing data available
          </div>
        )}
      </div>
    </div>
  );
};

export default FinOpsDashboard;
