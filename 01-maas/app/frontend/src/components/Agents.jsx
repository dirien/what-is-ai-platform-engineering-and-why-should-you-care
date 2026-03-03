import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import CreateAgentModal from './CreateAgentModal';
import AgentView from './AgentView';

const agentTypes = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'AI coding agent with terminal and web interface',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'Open-source AI agent with gateway web interface',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
];

const statusConfig = {
  running: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  creating: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  stopped: { bg: 'bg-charcoal-100', text: 'text-charcoal-600', dot: 'bg-charcoal-400' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
};

function getStatusBadge(status) {
  const config = statusConfig[status] || statusConfig.stopped;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function getModeBadge(mode) {
  if (mode === 'cli') {
    return <span className="badge badge-neutral">CLI</span>;
  }
  return <span className="badge badge-blue">Web</span>;
}

const Agents = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const fetchAgents = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/agents');
      setAgents(response.data.agents || []);
    } catch (err) {
      console.error('Error fetching agents:', err);
      if (err.response?.status !== 503) {
        setError(err.response?.data?.error || err.message || 'Failed to fetch agents');
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents(true);
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const deleteAgent = async (agentName) => {
    try {
      await axios.delete(`/api/agents/${agentName}`);
      if (selectedAgent?.name === agentName) {
        setSelectedAgent(null);
      }
      fetchAgents(true);
    } catch (err) {
      console.error('Error deleting agent:', err);
      setError(err.response?.data?.error || 'Failed to delete agent');
    }
  };

  const handleAgentCreated = useCallback(() => {
    setShowCreateModal(false);
    setSelectedAgentType(null);
    fetchAgents(true);
  }, [fetchAgents]);

  const handleBackFromAgent = useCallback(() => setSelectedAgent(null), []);

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setSelectedAgentType(null);
  }, []);

  // Show agent view when an agent is selected
  if (selectedAgent) {
    return (
      <AgentView
        agent={selectedAgent}
        onBack={handleBackFromAgent}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-8 lg:p-10">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
            <p className="mt-4 text-charcoal-500 font-medium">Loading agents...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-10">
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-charcoal-900 font-display mb-2">Agents</h1>
          <p className="text-charcoal-500">Launch and manage AI coding agents with sandbox isolation</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(prev => !prev)}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Agent
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)}></div>
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-charcoal-100 z-20 overflow-hidden">
                {agentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      if (!type.disabled) {
                        setSelectedAgentType(type.id);
                        setShowCreateModal(true);
                        setShowDropdown(false);
                      }
                    }}
                    disabled={type.disabled}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                      type.disabled
                        ? 'opacity-50 cursor-not-allowed bg-charcoal-50'
                        : 'hover:bg-cream-100'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${type.disabled ? 'bg-charcoal-100' : 'bg-primary-100'}`}>
                      {type.icon}
                    </div>
                    <div>
                      <p className="font-medium text-charcoal-900 text-sm">{type.name}</p>
                      <p className="text-charcoal-500 text-xs">{type.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card p-6">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-900 mb-2">OpenCode</h3>
          <p className="text-charcoal-500 text-sm">AI coding agent with terminal and web UI for editing, testing, and iterating on code</p>
        </div>

        <div className="card p-6">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-900 mb-2">OpenClaw</h3>
          <p className="text-charcoal-500 text-sm">Open-source AI agent with gateway web interface and tool orchestration</p>
        </div>

        <div className="card p-6">
          <div className="w-12 h-12 rounded-xl bg-sage-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-900 mb-2">Sandbox Isolation</h3>
          <p className="text-charcoal-500 text-sm">Every agent runs in a gVisor-isolated sandbox for security</p>
        </div>
      </div>

      {/* Agents List */}
      <div className="card">
        <div className="px-6 py-4 border-b border-charcoal-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-charcoal-900">Active Agents</h2>
          <button
            onClick={() => fetchAgents(true)}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-charcoal-100 flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-charcoal-800 mb-1">No agents running</h3>
            <p className="text-charcoal-500 mb-6">Create a new agent to get started with AI-powered coding</p>
            <button
              onClick={() => {
                setSelectedAgentType('opencode');
                setShowCreateModal(true);
              }}
              className="btn-primary"
            >
              Create Agent
            </button>
          </div>
        ) : (
          <div className="divide-y divide-charcoal-100">
            {agents.map((agent) => (
              <div key={agent.name} className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-charcoal-900">{agent.name}</h3>
                      {getModeBadge(agent.mode)}
                    </div>
                    <p className="text-sm text-charcoal-500">
                      {agent.type}{agent.type !== 'openclaw' && <> &middot; {agent.gitRepo || 'No repo'}</>}
                      {agent.createdAt && ` · Started ${new Date(agent.createdAt).toLocaleString()}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {getStatusBadge(agent.status)}

                  {agent.status === 'running' && (
                    <button
                      onClick={() => setSelectedAgent(agent)}
                      className="btn-primary text-sm"
                    >
                      Open
                    </button>
                  )}

                  <button
                    onClick={() => deleteAgent(agent.name)}
                    className="btn-ghost text-red-600 hover:text-red-700 hover:bg-red-50 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          agentType={selectedAgentType}
          onClose={handleCloseCreateModal}
          onCreated={handleAgentCreated}
        />
      )}
    </div>
  );
};

export default Agents;
