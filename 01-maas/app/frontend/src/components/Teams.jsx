import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatCurrency } from '../utils/spend';
import TeamDetailModal from './TeamDetailModal';

const Teams = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/teams');
      const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setTeams(data);
    } catch (err) {
      console.error('Error fetching teams:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch teams');
    } finally {
      setLoading(false);
    }
  };

  const viewTeamDetails = async (teamId) => {
    try {
      const response = await axios.get(`/api/teams/${encodeURIComponent(teamId)}`);
      setSelectedTeam(response.data?.team_info || response.data);
    } catch (err) {
      console.error('Error fetching team details:', err);
      alert(err.response?.data?.error || 'Failed to fetch team details');
    }
  };

  const getUtilization = (spend, maxBudget) => {
    if (!maxBudget || maxBudget <= 0) return null;
    return Math.min((spend / maxBudget) * 100, 100);
  };

  const getUtilizationColor = (pct) => {
    if (pct === null) return 'bg-charcoal-200';
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-sage-500';
  };

  if (loading) {
    return (
      <div className="p-8 lg:p-10">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-charcoal-200 border-t-primary-500"></div>
            <p className="mt-4 text-charcoal-500 font-medium">Loading teams...</p>
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
              <h3 className="text-lg font-semibold text-red-800">Error loading teams</h3>
              <p className="mt-1 text-red-700">{error}</p>
              <button
                onClick={fetchTeams}
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
        <h1 className="text-3xl font-bold text-charcoal-900 font-display mb-2">Teams</h1>
        <p className="text-charcoal-500">View team budgets and utilization. Manage teams in the LiteLLM dashboard.</p>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-charcoal-200">
          <div className="w-16 h-16 rounded-2xl bg-charcoal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-charcoal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal-800 mb-1">No teams configured</h3>
          <p className="text-charcoal-500">Create teams in the LiteLLM dashboard.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-charcoal-100/50 overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="table-header">
                <th className="px-6 py-4 text-left">Team Name</th>
                <th className="px-6 py-4 text-left">Members</th>
                <th className="px-6 py-4 text-left">Budget</th>
                <th className="px-6 py-4 text-left">Current Spend</th>
                <th className="px-6 py-4 text-left">Utilization</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const spend = team.spend || 0;
                const maxBudget = team.max_budget;
                const utilization = getUtilization(spend, maxBudget);
                const barColor = getUtilizationColor(utilization);

                return (
                  <tr key={team.team_id} className="table-row">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-charcoal-900">
                        {team.team_alias || team.team_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-charcoal-700">
                        {(team.members_with_roles || []).length}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {maxBudget != null && maxBudget > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-charcoal-900">
                            {formatCurrency(maxBudget)}
                          </span>
                          {team.budget_duration && (
                            <span className="badge badge-neutral text-xs">
                              {team.budget_duration}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-charcoal-400">No budget</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-charcoal-900">
                        {formatCurrency(spend)}
                      </span>
                    </td>
                    <td className="px-6 py-4 w-44">
                      {utilization !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-charcoal-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${barColor}`}
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-charcoal-600 w-10 text-right">
                            {utilization.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-charcoal-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => viewTeamDetails(team.team_id)}
                        className="p-2 rounded-lg text-charcoal-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="View details"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTeam && (
        <TeamDetailModal
          team={selectedTeam}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
};

export default Teams;
