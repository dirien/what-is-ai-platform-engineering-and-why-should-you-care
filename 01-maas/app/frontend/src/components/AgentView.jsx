import AgentTerminal from './AgentTerminal';

const AgentView = ({ agent, onBack }) => {
  const proxyUrl = `/api/agents/${agent.name}/proxy/`;

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-charcoal-100">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-charcoal-100 transition-colors"
          >
            <svg className="w-5 h-5 text-charcoal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-charcoal-900 text-sm">{agent.name}</h2>
            <p className="text-charcoal-500 text-xs">
              {agent.type} &middot; {agent.mode === 'cli' ? 'Terminal' : 'Web UI'}
              {agent.gitRepo && ` · ${agent.gitRepo}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${agent.mode === 'cli' ? 'badge-neutral' : 'badge-blue'}`}>
            {agent.mode === 'cli' ? 'CLI' : 'Web'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Running
          </span>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {agent.mode === 'cli' ? (
          <AgentTerminal agentName={agent.name} />
        ) : (
          <iframe
            src={proxyUrl}
            title={`Agent: ${agent.name}`}
            className="w-full h-full border-0"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  );
};

export default AgentView;
