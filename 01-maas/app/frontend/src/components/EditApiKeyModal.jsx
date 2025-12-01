import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EditApiKeyModal = ({ apiKey, onClose, onKeyUpdated, availableModels, loadingModels }) => {
  const [name, setName] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (apiKey) {
      setName(apiKey.name);
      setSelectedModels(apiKey.models);
    }
  }, [apiKey]);

  const filteredModels = availableModels.filter(model =>
    model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleModel = (model) => {
    if (selectedModels.includes(model)) {
      setSelectedModels(selectedModels.filter(m => m !== model));
    } else {
      setSelectedModels([...selectedModels, model]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a key name');
      return;
    }

    if (selectedModels.length === 0) {
      setError('Please select at least one model');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.put(`/api/keys/${apiKey.id}`, {
        name: name.trim(),
        models: selectedModels
      });
      onKeyUpdated(response.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!apiKey) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal panel */}
        <div
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">
                  Edit API Key
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Key Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Production Key, Development Key"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={isSubmitting}
                />
              </div>

              {/* Model Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Models ({selectedModels.length} selected)
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search models..."
                  className="w-full px-4 py-2 mb-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={isSubmitting}
                />
                <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                  {loadingModels ? (
                    <div className="p-4 text-center text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                      <p>Loading public models...</p>
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      {searchTerm ? 'No models match your search' : 'No public models available'}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {filteredModels.map((model) => (
                        <label
                          key={model}
                          className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedModels.includes(model)}
                            onChange={() => toggleModel(model)}
                            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                            disabled={isSubmitting}
                          />
                          <span className="ml-3 text-sm text-gray-900 font-mono">{model}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedModels.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selected Models
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedModels.map((model) => (
                      <span
                        key={model}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
                      >
                        {model}
                        <button
                          type="button"
                          onClick={() => toggleModel(model)}
                          className="ml-2 text-primary hover:text-primary-700"
                          disabled={isSubmitting}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditApiKeyModal;
