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
      // Fetch public model hub (only public models)
      const response = await axios.get('/api/public-model-hub');

      console.log('Public model hub response:', response.data);

      // The response is an array of public model groups
      const publicModels = response.data || [];

      // Transform public model hub data to match the expected format
      const modelsList = publicModels.map(modelGroup => ({
        id: modelGroup.model_group,
        object: 'model',
        created: Date.now(),
        owned_by: modelGroup.providers?.join(', ') || 'unknown'
      }));

      // Create a map of model info by model group name
      const infoMap = {};
      publicModels.forEach(modelGroup => {
        if (modelGroup.model_group) {
          infoMap[modelGroup.model_group] = {
            model_name: modelGroup.model_group,
            ...modelGroup
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
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="mt-4 text-gray-600">Loading models...</p>
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
              <h3 className="text-lg font-medium text-red-800">Error loading models</h3>
              <p className="mt-2 text-red-700">{error}</p>
              <button 
                onClick={fetchModels}
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Models</h1>
        <p className="text-gray-600">Browse and explore available LLM models</p>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <svg 
            className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-gray-600">
          Found <span className="font-semibold text-gray-900">{filteredModels.length}</span> model{filteredModels.length !== 1 ? 's' : ''}
        </p>
        <button 
          onClick={fetchModels}
          className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {filteredModels.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No models found</h3>
          <p className="mt-1 text-gray-500">
            {searchTerm ? 'Try adjusting your search' : 'No models available'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
