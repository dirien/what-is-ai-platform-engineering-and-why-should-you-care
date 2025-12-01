import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CreateApiKeyModal from './CreateApiKeyModal';
import ApiKeyDetailModal from './ApiKeyDetailModal';
import EditApiKeyModal from './EditApiKeyModal';
import ApiKeyCreatedModal from './ApiKeyCreatedModal';

const ApiKeys = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedKeyForDetail, setSelectedKeyForDetail] = useState(null);
  const [selectedKeyForEdit, setSelectedKeyForEdit] = useState(null);
  const [keyToDelete, setKeyToDelete] = useState(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);

  useEffect(() => {
    fetchApiKeys();
    fetchAvailableModels();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/keys');
      setApiKeys(response.data.data || []);
    } catch (err) {
      console.error('Error fetching API keys:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableModels = async () => {
    setLoadingModels(true);
    try {
      // Fetch only public models from the model hub
      const response = await axios.get('/api/public-model-hub');
      console.log('Public model hub response:', response.data);
      const models = response.data?.map(m => m.model_group) || [];
      console.log('Extracted model names:', models);
      setAvailableModels(models);
    } catch (err) {
      console.error('Error fetching public models:', err);
      // Use empty array if API fails - don't show any models if we can't verify they're public
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleKeyCreated = (newKey) => {
    setNewlyCreatedKey(newKey);
    setShowCreateModal(false);
    fetchApiKeys();
  };

  const handleKeyUpdated = (updatedKey) => {
    fetchApiKeys();
  };

  const handleKeyRegenerated = (newKey) => {
    setNewlyCreatedKey(newKey);
    setSelectedKeyForDetail(null);
    fetchApiKeys();
  };

  const handleDeleteKey = async (keyId) => {
    try {
      await axios.delete(`/api/keys/${keyId}`);
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
      setKeyToDelete(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete API key');
    }
  };

  const viewKeyDetails = async (keyId) => {
    try {
      const response = await axios.get(`/api/keys/${keyId}`);
      setSelectedKeyForDetail(response.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to fetch key details');
    }
  };

  const editKey = async (keyId) => {
    try {
      const response = await axios.get(`/api/keys/${keyId}`);
      setSelectedKeyForEdit(response.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to fetch key details');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="mt-4 text-gray-600">Loading API keys...</p>
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
              <h3 className="text-lg font-medium text-red-800">Error loading API keys</h3>
              <p className="mt-2 text-red-700">{error}</p>
              <button
                onClick={fetchApiKeys}
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">API Keys</h1>
          <p className="text-gray-600">Manage your Acme Inc. API keys</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create API Key
        </button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No API keys</h3>
          <p className="mt-1 text-gray-500">Get started by creating a new API key.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Create your first API key
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Key
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Models
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{key.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                      {key.key}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {key.models.slice(0, 2).map((model) => (
                        <span
                          key={model}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800"
                        >
                          {model}
                        </span>
                      ))}
                      {key.models.length > 2 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          +{key.models.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(key.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{key.usage_count.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => viewKeyDetails(key.id)}
                        className="text-primary hover:text-primary-700 transition-colors"
                        title="View details"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => editKey(key.id)}
                        className="text-green-600 hover:text-green-900 transition-colors"
                        title="Edit key"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setKeyToDelete(key)}
                        className="text-red-600 hover:text-red-900 transition-colors"
                        title="Delete key"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateApiKeyModal
          onClose={() => setShowCreateModal(false)}
          onKeyCreated={handleKeyCreated}
          availableModels={availableModels}
          loadingModels={loadingModels}
        />
      )}

      {newlyCreatedKey && (
        <ApiKeyCreatedModal
          apiKey={newlyCreatedKey}
          onClose={() => setNewlyCreatedKey(null)}
        />
      )}

      {selectedKeyForDetail && (
        <ApiKeyDetailModal
          apiKey={selectedKeyForDetail}
          onClose={() => setSelectedKeyForDetail(null)}
          onKeyRegenerated={handleKeyRegenerated}
        />
      )}

      {selectedKeyForEdit && (
        <EditApiKeyModal
          apiKey={selectedKeyForEdit}
          onClose={() => setSelectedKeyForEdit(null)}
          onKeyUpdated={handleKeyUpdated}
          availableModels={availableModels}
          loadingModels={loadingModels}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {keyToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto" onClick={() => setKeyToDelete(null)}>
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true"></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div
              className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Delete API Key</h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to delete the API key "<strong>{keyToDelete.name}</strong>"? This action cannot be undone and will immediately invalidate the key.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteKey(keyToDelete.id)}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setKeyToDelete(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeys;
