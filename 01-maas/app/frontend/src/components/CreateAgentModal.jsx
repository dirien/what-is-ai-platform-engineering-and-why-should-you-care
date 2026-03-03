import { useState, useEffect } from 'react';
import axios from 'axios';

const modes = [
  {
    id: 'web',
    name: 'Web UI',
    description: 'Full OpenCode web interface in an embedded view',
    icon: (
      <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    id: 'cli',
    name: 'Terminal',
    description: 'Interactive terminal session with shell access',
    icon: (
      <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
];

const flavourIcons = {
  code: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  cloud: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  ),
  frontend: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
    </svg>
  ),
  devops: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  testing: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  general: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
};

const copyToClipboard = async (text, setCopied) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const CreateAgentModal = ({ agentType, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [mode, setMode] = useState('web');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [createdToken, setCreatedToken] = useState(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Flavour state
  const [flavours, setFlavours] = useState([]);
  const [selectedFlavours, setSelectedFlavours] = useState([]);
  const [flavoursLoading, setFlavoursLoading] = useState(false);

  useEffect(() => {
    if (agentType !== 'opencode') return;
    setFlavoursLoading(true);
    axios.get('/api/flavours')
      .then(res => setFlavours(res.data.flavours || []))
      .catch(err => console.error('Failed to load flavours:', err))
      .finally(() => setFlavoursLoading(false));
  }, [agentType]);

  const toggleFlavour = (id) => {
    setSelectedFlavours(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await axios.post('/api/agents', {
        type: agentType,
        name: name.trim() || undefined,
        gitRepo: gitRepo.trim() || undefined,
        mode,
        flavours: selectedFlavours,
      });
      if (response.data.gatewayToken) {
        setCreatedToken(response.data.gatewayToken);
      } else {
        onCreated();
      }
    } catch (err) {
      console.error('Error creating agent:', err);
      setError(err.response?.data?.error || 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  // Token display view — shown after openclaw agent is created
  if (createdToken) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 z-0 bg-charcoal-900/40"></div>

          <div className="relative z-10 bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-charcoal-900 font-display">Agent Created</h2>
                <p className="text-charcoal-500 text-sm">OpenClaw gateway token generated</p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-5">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700 font-medium">
                    Save this token — paste it into OpenClaw Settings after launch
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-charcoal-700 mb-2">
                Gateway Token
              </label>
              <div className="relative">
                <code className="block w-full px-3 py-2 bg-charcoal-50 border border-charcoal-200 rounded-lg text-xs font-mono text-charcoal-900 break-all pr-20">
                  {createdToken}
                </code>
                <button
                  onClick={() => copyToClipboard(createdToken, setTokenCopied)}
                  className="absolute top-2 right-2 px-3 py-1 bg-primary-500 text-white text-xs rounded hover:bg-primary-600 transition-colors flex items-center gap-1"
                >
                  {tokenCopied ? (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => onCreated()}
                className="btn-primary"
              >
                I've Saved My Token
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 z-0 bg-charcoal-900/40" onClick={onClose}></div>

        <div className="relative z-10 bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-charcoal-900 font-display">Create Agent</h2>
              <p className="text-charcoal-500 text-sm mt-1">
                Launch a new {agentType === 'opencode' ? 'OpenCode' : agentType === 'openclaw' ? 'OpenClaw' : agentType} agent
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-charcoal-100 transition-colors"
            >
              <svg className="w-5 h-5 text-charcoal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Agent Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Agent Name <span className="text-charcoal-400">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-generated if empty"
              className="input"
            />
          </div>

          {/* Git Repository — not applicable for openclaw */}
          {agentType !== 'openclaw' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-charcoal-700 mb-2">
                Git Repository <span className="text-charcoal-400">(optional)</span>
              </label>
              <input
                type="text"
                value={gitRepo}
                onChange={(e) => setGitRepo(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="input"
              />
              <p className="text-charcoal-400 text-xs mt-1.5">Repository will be cloned into the agent workspace</p>
            </div>
          )}

          {/* Interface Mode — openclaw is web-only */}
          {agentType !== 'openclaw' && (
            <div className="mb-8">
              <label className="block text-sm font-medium text-charcoal-700 mb-3">
                Interface Mode
              </label>
              <div className="grid grid-cols-2 gap-4">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      mode === m.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-charcoal-200 hover:border-charcoal-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl ${mode === m.id ? 'bg-primary-100' : 'bg-charcoal-100'}`}>
                        {m.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-charcoal-900">{m.name}</h3>
                        <p className="text-sm text-charcoal-500 mt-1">{m.description}</p>
                      </div>
                      {mode === m.id && (
                        <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skill Flavours — only for opencode agents */}
          {agentType === 'opencode' && (
            <div className="mb-8">
              <label className="block text-sm font-medium text-charcoal-700 mb-3">
                Skill Flavours <span className="text-charcoal-400">(optional)</span>
              </label>
              {flavoursLoading ? (
                <div className="flex items-center gap-2 text-charcoal-400 text-sm py-3">
                  <div className="w-4 h-4 border-2 border-charcoal-300 border-t-charcoal-600 rounded-full animate-spin"></div>
                  Loading flavours...
                </div>
              ) : flavours.length === 0 ? (
                <p className="text-charcoal-400 text-sm">No skill flavours configured</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {flavours.map((f) => {
                    const isSelected = selectedFlavours.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFlavour(f.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-charcoal-200 hover:border-charcoal-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-lg flex-shrink-0 ${isSelected ? 'bg-primary-100 text-primary-600' : 'bg-charcoal-100 text-charcoal-500'}`}>
                            {flavourIcons[f.icon] || flavourIcons.general}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-charcoal-900 text-sm">{f.name}</h3>
                            <p className="text-xs text-charcoal-500 mt-0.5">{f.description}</p>
                            <p className="text-xs text-charcoal-400 mt-1">{f.skills.length} skill{f.skills.length !== 1 ? 's' : ''}</p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="btn-ghost"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="btn-primary flex items-center gap-2"
              disabled={creating}
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Launch Agent
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAgentModal;
