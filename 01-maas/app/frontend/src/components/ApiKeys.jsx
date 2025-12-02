import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CreateApiKeyModal from './CreateApiKeyModal';
import ApiKeyDetailModal from './ApiKeyDetailModal';
import EditApiKeyModal from './EditApiKeyModal';
import ApiKeyCreatedModal from './ApiKeyCreatedModal';
import ApiKeyUsageModal from './ApiKeyUsageModal';

const ApiKeys = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedKeyForDetail, setSelectedKeyForDetail] = useState(null);
  const [selectedKeyForEdit, setSelectedKeyForEdit] = useState(null);
  const [selectedKeyForUsage, setSelectedKeyForUsage] = useState(null);
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
      const response = await axios.get('/api/public-model-hub');
      const models = response.data?.map(m => m.model_group) || [];
      setAvailableModels(models);
    } catch (err) {
      console.error('Error fetching public models:', err);
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

  const handleKeyUpdated = () => {
    fetchApiKeys();
  };

  const handleKeyRegenerated = (newKey) => {
    setNewlyCreatedKey(newKey);
    setSelectedKeyForDetail(null);
    fetchApiKeys();
  };

  const handleDeleteKey = async (keyId) => {
    if (!keyId) {
      alert('Invalid key ID');
      return;
    }
    try {
      await axios.delete(`/api/keys/${encodeURIComponent(keyId)}`);
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
      setKeyToDelete(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete API key');
    }
  };

  const viewKeyDetails = async (keyId) => {
    if (!keyId) {
      alert('Invalid key ID');
      return;
    }
    try {
      const response = await axios.get(`/api/keys/${encodeURIComponent(keyId)}`);
      setSelectedKeyForDetail(response.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to fetch key details');
    }
  };

  const editKey = async (keyId) => {
    if (!keyId) {
      alert('Invalid key ID');
      return;
    }
    try {
      const response = await axios.get(`/api/keys/${encodeURIComponent(keyId)}`);
      setSelectedKeyForEdit(response.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to fetch key details');
    }
  };

  if (loading) {
    return (
      <div className="p-8 lg:p-10">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
            <p className="mt-4 text-charcoal-500 font-medium">Loading API keys...</p>
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
              <h3 className="text-lg font-semibold text-red-800">Error loading API keys</h3>
              <p className="mt-1 text-red-700">{error}</p>
              <button
                onClick={fetchApiKeys}
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
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-charcoal-900 font-display mb-2">API Keys</h1>
          <p className="text-charcoal-500">Manage your Acme Inc. API keys</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create API Key
        </button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-charcoal-200">
          <div className="w-16 h-16 rounded-2xl bg-charcoal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-800 mb-1">No API keys</h3>
          <p className="text-charcoal-500 mb-6">Get started by creating a new API key.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            Create your first API key
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-charcoal-100/50 overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-4 text-left">Name</th>
                <th className="px-6 py-4 text-left">Key</th>
                <th className="px-6 py-4 text-left">Models</th>
                <th className="px-6 py-4 text-left">Created</th>
                <th className="px-6 py-4 text-left">Usage</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key) => (
                <tr key={key.id} className="table-row">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-charcoal-900">{key.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs font-mono text-charcoal-600 bg-charcoal-100 px-2.5 py-1 rounded-lg">
                      {key.key}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {key.models.slice(0, 2).map((model) => (
                        <span key={model} className="badge badge-primary">
                          {model}
                        </span>
                      ))}
                      {key.models.length > 2 && (
                        <span className="badge badge-neutral">
                          +{key.models.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-charcoal-700">
                      {new Date(key.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => setSelectedKeyForUsage(key)}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                      title="View usage details"
                    >
                      ${typeof key.usage_count === 'number' ? key.usage_count.toFixed(4) : '0.0000'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setSelectedKeyForUsage(key)}
                        className="p-2 rounded-lg text-charcoal-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="View usage & costs"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => viewKeyDetails(key.id)}
                        className="p-2 rounded-lg text-charcoal-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="View details"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => editKey(key.id)}
                        className="p-2 rounded-lg text-charcoal-500 hover:text-sage-600 hover:bg-sage-50 transition-colors"
                        title="Edit key"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setKeyToDelete(key)}
                        className="p-2 rounded-lg text-charcoal-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete key"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
            <div className="fixed inset-0 transition-opacity bg-charcoal-900/40 backdrop-blur-sm" aria-hidden="true"></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div
              className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-soft-lg transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-charcoal-900">Delete API Key</h3>
                    <p className="mt-2 text-sm text-charcoal-600">
                      Are you sure you want to delete <strong className="text-charcoal-900">{keyToDelete.name}</strong>? This action cannot be undone and will immediately invalidate the key.
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-cream-100 flex flex-row-reverse gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteKey(keyToDelete.id)}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setKeyToDelete(null)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage Modal */}
      {selectedKeyForUsage && (
        <ApiKeyUsageModal
          apiKey={selectedKeyForUsage}
          onClose={() => setSelectedKeyForUsage(null)}
        />
      )}
    </div>
  );
};

export default ApiKeys;
