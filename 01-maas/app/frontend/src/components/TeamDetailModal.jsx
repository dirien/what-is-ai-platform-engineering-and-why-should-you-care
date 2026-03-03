import { formatCurrency } from '../utils/spend';

const TeamDetailModal = ({ team, onClose }) => {
  if (!team) return null;

  const teamName = team.team_alias || team.team_id || 'Unknown Team';
  const spend = team.spend || 0;
  const maxBudget = team.max_budget;
  const members = team.members_with_roles || [];
  const models = team.models || [];
  const hasBudget = maxBudget != null && maxBudget > 0;
  const utilization = hasBudget ? Math.min((spend / maxBudget) * 100, 100) : null;

  const getBarColor = (pct) => {
    if (pct === null) return 'bg-charcoal-200';
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-sage-500';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 z-0 transition-opacity bg-charcoal-900/40" aria-hidden="true"></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div
          className="relative z-10 inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-soft-lg transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-primary-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white">{teamName}</h3>
                <p className="text-primary-50 text-sm mt-1">Team Details</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-primary-50 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-6 max-h-[70vh] overflow-y-auto">
            {/* Info Grid */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-charcoal-900 mb-3 flex items-center">
                <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Information
              </h4>
              <div className="bg-cream-50 rounded-xl p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-charcoal-500 mb-1">Created</p>
                  <p className="text-sm text-charcoal-900 font-medium">
                    {team.created_at ? new Date(team.created_at).toLocaleDateString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-1">Budget</p>
                  <p className="text-sm text-charcoal-900 font-medium">
                    {hasBudget ? (
                      <>{formatCurrency(maxBudget)} / {team.budget_duration || 'total'}</>
                    ) : (
                      'No budget set'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-1">Current Spend</p>
                  <p className="text-sm text-charcoal-900 font-medium">{formatCurrency(spend)}</p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-500 mb-1">Utilization</p>
                  <p className="text-sm text-charcoal-900 font-medium">
                    {utilization !== null ? `${utilization.toFixed(1)}%` : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Budget Progress Bar */}
            {hasBudget && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-charcoal-700">Budget Usage</span>
                  <span className="text-sm text-charcoal-500">
                    {formatCurrency(spend)} / {formatCurrency(maxBudget)}
                  </span>
                </div>
                <div className="w-full bg-charcoal-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${getBarColor(utilization)}`}
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              </div>
            )}

            {/* Allowed Models */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-charcoal-900 mb-3 flex items-center">
                <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                Allowed Models
              </h4>
              <div className="bg-cream-50 rounded-xl p-4">
                {models.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {models.map((model) => (
                      <span key={model} className="badge badge-primary">
                        {model}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-charcoal-500">All models (no restrictions)</p>
                )}
              </div>
            </div>

            {/* Members */}
            <div>
              <h4 className="text-lg font-semibold text-charcoal-900 mb-3 flex items-center">
                <svg className="h-5 w-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                Members ({members.length})
              </h4>
              {members.length > 0 ? (
                <div className="bg-cream-50 rounded-xl p-4 space-y-2">
                  {members.map((member, index) => (
                    <div key={member.user_id || index} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-charcoal-700 font-medium">
                        {member.user_email || member.user_id || 'Unknown'}
                      </span>
                      <span className="badge badge-neutral text-xs capitalize">
                        {member.role || 'member'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-cream-50 rounded-xl p-4">
                  <p className="text-sm text-charcoal-500">No members assigned</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-cream-100 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-primary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamDetailModal;
