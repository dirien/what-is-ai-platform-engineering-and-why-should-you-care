import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CreateApiKeyModal = ({ onClose, onKeyCreated, availableModels, loadingModels }) => {
  const [name, setName] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      const response = await axios.post('/api/keys', {
        name: name.trim(),
        models: selectedModels
      });
      // Call the callback to show the newly created key
      onKeyCreated(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create API key');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-charcoal-900/40 backdrop-blur-sm" aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div
          className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-soft-lg transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-charcoal-900 font-display">
                  Create New API Key
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-charcoal-400 hover:text-charcoal-600 hover:bg-charcoal-100 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Key Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-charcoal-700 mb-2">
                  Key Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Production Key, Development Key"
                  className="input"
                  disabled={isSubmitting}
                />
              </div>

              {/* Model Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-charcoal-700 mb-2">
                  Select Models ({selectedModels.length} selected)
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search models..."
                  className="input mb-3"
                  disabled={isSubmitting}
                />
                <div className="border border-charcoal-200 rounded-xl max-h-64 overflow-y-auto">
                  {loadingModels ? (
                    <div className="p-6 text-center text-charcoal-500">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-charcoal-200 border-t-primary-500 mb-3"></div>
                      <p className="font-medium">Loading public models...</p>
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <div className="p-6 text-center text-charcoal-500">
                      {searchTerm ? 'No models match your search' : 'No public models available'}
                    </div>
                  ) : (
                    <div className="divide-y divide-charcoal-100">
                      {filteredModels.map((model) => (
                        <label
                          key={model}
                          className="flex items-center p-3 hover:bg-cream-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedModels.includes(model)}
                            onChange={() => toggleModel(model)}
                            className="h-4 w-4 text-primary-500 focus:ring-primary-200 border-charcoal-300 rounded"
                            disabled={isSubmitting}
                          />
                          <span className="ml-3 text-sm text-charcoal-900 font-mono">{model}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedModels.length > 0 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-charcoal-700 mb-2">
                    Selected Models
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedModels.map((model) => (
                      <span
                        key={model}
                        className="badge badge-primary"
                      >
                        {model}
                        <button
                          type="button"
                          onClick={() => toggleModel(model)}
                          className="ml-2 text-primary-600 hover:text-primary-800"
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
            <div className="px-6 py-4 bg-cream-100 flex flex-row-reverse gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create API Key'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
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

export default CreateApiKeyModal;
