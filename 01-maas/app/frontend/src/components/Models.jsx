import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ModelCard from './ModelCard';
import ModelDetailModal from './ModelDetailModal';

const Models = () => {
  const [models, setModels] = useState([]);
  const [modelInfo, setModelInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both public model hub and detailed model info
      const [publicResponse, detailedResponse] = await Promise.all([
        axios.get('/api/public-model-hub'),
        axios.get('/api/model-info')
      ]);

      const publicModels = publicResponse.data || [];
      const detailedModels = detailedResponse.data?.data || [];

      // Create a map of detailed model info by model_name for merging
      const detailedInfoMap = {};
      detailedModels.forEach(model => {
        if (model.model_name) {
          detailedInfoMap[model.model_name] = {
            input_cost_per_token: model.model_info?.input_cost_per_token,
            output_cost_per_token: model.model_info?.output_cost_per_token,
            max_tokens: model.model_info?.max_tokens,
            max_input_tokens: model.model_info?.max_input_tokens,
            max_output_tokens: model.model_info?.max_output_tokens,
            description: model.model_info?.description,
            litellm_provider: model.model_info?.litellm_provider,
            mode: model.model_info?.mode,
            supports_function_calling: model.model_info?.supports_function_calling,
            supports_vision: model.model_info?.supports_vision,
            supports_tool_choice: model.model_info?.supports_tool_choice,
            supported_openai_params: model.model_info?.supported_openai_params,
          };
        }
      });

      const modelsList = publicModels.map(modelGroup => ({
        id: modelGroup.model_group,
        object: 'model',
        created: Date.now(),
        owned_by: modelGroup.providers?.join(', ') || 'unknown'
      }));

      const infoMap = {};
      publicModels.forEach(modelGroup => {
        if (modelGroup.model_group) {
          // Merge public model hub data with detailed model info
          const detailedInfo = detailedInfoMap[modelGroup.model_group] || {};
          infoMap[modelGroup.model_group] = {
            model_name: modelGroup.model_group,
            ...modelGroup,
            // Override with detailed info if available (costs, tokens, etc.)
            input_cost_per_token: detailedInfo.input_cost_per_token ?? modelGroup.input_cost_per_token,
            output_cost_per_token: detailedInfo.output_cost_per_token ?? modelGroup.output_cost_per_token,
            max_tokens: detailedInfo.max_tokens ?? modelGroup.max_tokens,
            max_input_tokens: detailedInfo.max_input_tokens ?? modelGroup.max_input_tokens,
            max_output_tokens: detailedInfo.max_output_tokens ?? modelGroup.max_output_tokens,
            description: detailedInfo.description,
            mode: detailedInfo.mode || modelGroup.mode,
            supports_function_calling: detailedInfo.supports_function_calling ?? modelGroup.supports_function_calling,
            supports_vision: detailedInfo.supports_vision ?? modelGroup.supports_vision,
            supported_openai_params: detailedInfo.supported_openai_params || modelGroup.supported_openai_params,
          };
        }
      });

      setModels(modelsList);
      setModelInfo(infoMap);
    } catch (err) {
      console.error('Error fetching public models:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch public models');
    } finally {
      setLoading(false);
    }
  };

  const filteredModels = models.filter(model => {
    const modelId = model.id || '';
    return modelId.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <div className="p-8 lg:p-10">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
            <p className="mt-4 text-charcoal-500 font-medium">Loading models...</p>
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
              <h3 className="text-lg font-semibold text-red-800">Error loading models</h3>
              <p className="mt-1 text-red-700">{error}</p>
              <button
                onClick={fetchModels}
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
        <h1 className="text-3xl font-bold text-charcoal-900 font-display mb-2">Models</h1>
        <p className="text-charcoal-500">Browse and explore available LLM models</p>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-11"
          />
          <svg
            className="absolute left-4 top-3.5 h-5 w-5 text-charcoal-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-charcoal-500">
            <span className="font-semibold text-charcoal-700">{filteredModels.length}</span> model{filteredModels.length !== 1 ? 's' : ''} found
          </span>
          <button
            onClick={fetchModels}
            className="btn-ghost flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Models Grid */}
      {filteredModels.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-charcoal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-800 mb-1">No models found</h3>
          <p className="text-charcoal-500">
            {searchTerm ? 'Try adjusting your search terms' : 'No models available at the moment'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredModels.map((model, index) => (
            <ModelCard
              key={model.id || index}
              model={model}
              info={modelInfo[model.id]}
              onClick={() => setSelectedModel(model)}
            />
          ))}
        </div>
      )}

      {/* Model Detail Modal */}
      {selectedModel && (
        <ModelDetailModal
          model={selectedModel}
          info={modelInfo[selectedModel.id]}
          onClose={() => setSelectedModel(null)}
        />
      )}
    </div>
  );
};

export default Models;
