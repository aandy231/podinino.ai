import React, { useState, useEffect, useMemo } from 'react';

export default function CostAnalyticsDashboard({ 
  userContext,
  currentOrg, 
  currentTeam, 
  currentUser,
  userRole = 'team_member',
  onSelectOrg,
  onSelectTeam,
  onCreateTeam,
  onSwitchTeam
}) {
  const [timeRange, setTimeRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [devData, setDevData] = useState(null);

  // Check if current user has Team Lead (TL) or managerial privileges
  const isTL = useMemo(() => {
    return (
      userRole === 'team_lead' || 
      userRole === 'TL' || 
      userRole === 'org_admin' || 
      userRole === 'org_owner' ||
      currentTeam?.user_role === 'team_lead' ||
      (Array.isArray(userContext?.teams) && userContext.teams.some(t => t.user_role === 'team_lead'))
    );
  }, [userRole, currentTeam, userContext]);

  // Scope: 'personal' or 'team'. If TL, default to 'team', else strictly 'personal'.
  const [scope, setScope] = useState(isTL ? 'team' : 'personal');

  // Update scope if role changes
  useEffect(() => {
    if (!isTL && scope !== 'personal') {
      setScope('personal');
    }
  }, [isTL]);

  // Available teams for this user
  const availableTeams = useMemo(() => {
    const list = userContext?.teams || [];
    if (list.length > 0) return list;
    if (currentTeam) return [currentTeam];
    return [{ id: 'team-default', name: 'Engineering Team', monthly_budget_usd: 100 }];
  }, [userContext, currentTeam]);

  // Set default team if none selected
  useEffect(() => {
    if (!currentTeam && availableTeams.length > 0) {
      if (onSelectTeam) onSelectTeam(availableTeams[0]);
      if (onSwitchTeam) onSwitchTeam(availableTeams[0]);
    }
  }, [availableTeams, currentTeam, onSelectTeam, onSwitchTeam]);

  const getDisplayName = (uid) => {
    if (!uid) return currentUser?.name || currentUser?.login || 'Developer';
    if (uid === currentUser?.id || uid === currentUser?.login || uid === 'developer') {
      return currentUser?.name || currentUser?.login || 'Developer';
    }
    if (typeof uid === 'string' && uid.startsWith('git-') && currentUser?.id === uid) {
      return currentUser?.name || currentUser?.login || uid;
    }
    return uid;
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    const headers = {
      'Content-Type': 'application/json',
      'X-User-Id': currentUser?.id || currentUser?.login || 'default-user'
    };

    try {
      // 1. Fetch developer's own usage
      const devRes = await fetch(`/api/v1/analytics/developer/me?days=${timeRange}`, { headers });
      if (devRes.ok) {
        const dJson = await devRes.json();
        setDevData(dJson);
      }

      // 2. If TL and viewing team data
      if (currentTeam?.id && isTL) {
        const tRes = await fetch(`/api/v1/analytics/team/${currentTeam.id}?days=${timeRange}`, { headers });
        if (tRes.ok) {
          const tJson = await tRes.json();
          setTeamData(tJson);
        } else if (tRes.status === 403) {
          setTeamData(null);
        }
      }
    } catch (err) {
      console.error('Failed to load cost analytics:', err);
      setError('Unable to load analytics data. Ensure services are running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentTeam?.id, timeRange, scope, isTL]);

  const activeAnalytics = scope === 'personal' ? devData : (teamData || devData);
  const currentSpend = scope === 'personal'
    ? (devData?.total_spend_usd || 0)
    : (activeAnalytics?.current_period_spend_usd ?? (activeAnalytics?.total_spend_usd ?? 0));

  const budget = scope === 'personal' ? 50 : (currentTeam?.monthly_budget_usd || 100);
  const budgetPercent = Math.min(100, Math.round((currentSpend / Math.max(budget, 1)) * 100));

  const handleTeamChange = (e) => {
    const targetId = e.target.value;
    const found = availableTeams.find(t => t.id === targetId);
    if (found) {
      if (onSelectTeam) onSelectTeam(found);
      if (onSwitchTeam) onSwitchTeam(found);
    }
  };

  return (
    <div style={{ padding: '4px 0 32px 0', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '16px',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '16px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
            AI Usage & Cost Intelligence
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Cost breakdown across sandboxes, developers, and agent conversations.
          </p>
        </div>

        {/* Controls: Time filter & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              fontSize: '12.5px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
              fontWeight: '500',
              outline: 'none'
            }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: '#0f172a',
              fontSize: '12.5px',
              fontWeight: '500'
            }}
            title="Refresh analytics"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Scope Controls Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 18px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        {/* Left Side: Scope Switcher (Personal vs Team for TL) & Team Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
              Scope:
            </span>

            {isTL ? (
              <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                <button
                  type="button"
                  onClick={() => setScope('personal')}
                  style={{
                    padding: '5px 14px',
                    fontSize: '12px',
                    fontWeight: scope === 'personal' ? '600' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: scope === 'personal' ? '#ffffff' : 'transparent',
                    color: scope === 'personal' ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: scope === 'personal' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Personal
                </button>
                <button
                  type="button"
                  onClick={() => setScope('team')}
                  style={{
                    padding: '5px 14px',
                    fontSize: '12px',
                    fontWeight: scope === 'team' ? '600' : '500',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: scope === 'team' ? '#ffffff' : 'transparent',
                    color: scope === 'team' ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: scope === 'team' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Team
                </button>
              </div>
            ) : (
              <span style={{
                padding: '4px 10px',
                backgroundColor: '#f1f5f9',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#0f172a'
              }}>
                Personal
              </span>
            )}
          </div>

          {/* Team Dropdown Selector when Scope is Team */}
          {scope === 'team' && isTL && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                Team:
              </span>
              <select
                value={currentTeam?.id || availableTeams[0]?.id || ''}
                onChange={handleTeamChange}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {availableTeams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right Side: Monthly Budget Limit */}
        <div>
          <span style={{ fontSize: '10.5px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.04em' }}>
            {scope === 'team' ? 'Team Budget Limit' : 'Personal Monthly Limit'}
          </span>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
            ${budget.toFixed(2)}
          </div>
        </div>
      </div>

      {/* KPI Stat Cards Grid (4 columns) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Card 1: Total Spend */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
              {scope === 'team' ? 'Team Spend (USD)' : 'Personal Spend (USD)'}
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
            ${currentSpend > 0 && currentSpend < 1 ? currentSpend.toFixed(4) : currentSpend.toFixed(2)}
          </div>
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
              <span>Budget Utilized</span>
              <span style={{ fontWeight: '600', color: budgetPercent > 80 ? '#ef4444' : '#10b981' }}>{budgetPercent}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${budgetPercent}%`,
                height: '100%',
                backgroundColor: budgetPercent > 80 ? '#ef4444' : '#7c3aed',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        </div>

        {/* Card 2: AI Turns */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
              {scope === 'team' ? 'Team AI Turns' : 'Personal AI Turns'}
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a' }}>
            {(activeAnalytics?.total_turns ?? devData?.total_turns ?? 0).toLocaleString()}
          </div>
          <p style={{ fontSize: '11.5px', color: '#64748b', margin: '8px 0 0 0' }}>
            {scope === 'team' ? `Total prompt interactions across ${currentTeam?.name || 'team'}` : 'Prompt interactions executed by you'}
          </p>
        </div>

        {/* Card 3: Active Sandboxes */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Active Sandboxes</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a' }}>
            {scope === 'team'
              ? (activeAnalytics?.by_sandbox?.length ?? currentTeam?.active_sandbox_count ?? 0)
              : (devData?.by_sandbox?.length || 0)}
          </div>
          <p style={{ fontSize: '11.5px', color: '#64748b', margin: '8px 0 0 0' }}>
            {scope === 'team' ? `Sandboxes allocated in ${currentTeam?.name || 'team'}` : 'Sandboxes created by you'}
          </p>
        </div>

        {/* Card 4: Avg Turn Cost */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Avg Turn Cost</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a' }}>
            ${(activeAnalytics?.total_turns > 0 
              ? (currentSpend / activeAnalytics.total_turns) 
              : 0.0).toFixed(3)}
          </div>
          <p style={{ fontSize: '11.5px', color: '#64748b', margin: '8px 0 0 0' }}>
            Average cost per Claude Code interaction
          </p>
        </div>
      </div>

      {/* Spend Breakdown by Developer Table (Visible in Team Scope for TL) */}
      {scope === 'team' && isTL && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              AI Spend by Developer ({currentTeam?.name || 'Team Roster'})
            </h3>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '8px 12px', fontWeight: '600' }}>Developer</th>
                <th style={{ padding: '8px 12px', fontWeight: '600' }}>Active Sandboxes</th>
                <th style={{ padding: '8px 12px', fontWeight: '600' }}>Total Turns</th>
                <th style={{ padding: '8px 12px', fontWeight: '600' }}>Spend (USD)</th>
                <th style={{ padding: '8px 12px', fontWeight: '600' }}>% of Team Spend</th>
              </tr>
            </thead>
            <tbody>
              {(activeAnalytics?.by_developer || []).length > 0 ? (
                activeAnalytics.by_developer.map((dev, idx) => {
                  const devShare = currentSpend > 0 ? Math.round((dev.spend_usd / currentSpend) * 100) : 0;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#0f172a' }}>
                        {getDisplayName(dev.user_id)}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>
                        {dev.active_sandboxes || 1}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>
                        {dev.turns}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#7c3aed' }}>
                        ${dev.spend_usd.toFixed(4)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${devShare}%`, height: '100%', backgroundColor: '#2563eb' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{devShare}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    No team developer activity recorded for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Spend Breakdown by Sandbox Table */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
            {scope === 'team' ? `Top Sandboxes in ${currentTeam?.name || 'Team'}` : 'Your Sandboxes by AI Spend'}
          </h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Sandbox ID</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Developer</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Turns</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Total Cost (USD)</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Last Active</th>
            </tr>
          </thead>
          <tbody>
            {((activeAnalytics?.by_sandbox?.length > 0) ? activeAnalytics.by_sandbox : (devData?.by_sandbox || [])).length > 0 ? (
              ((activeAnalytics?.by_sandbox?.length > 0) ? activeAnalytics.by_sandbox : (devData?.by_sandbox || [])).map((sb, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#0f172a', fontWeight: '600' }}>
                    {sb.workspace_id}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    {getDisplayName(sb.user_id)}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    {sb.turns}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: '#10b981' }}>
                    ${sb.spend_usd.toFixed(4)}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '12px' }}>
                    {sb.last_activity ? new Date(sb.last_activity).toLocaleDateString() : 'Recent'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                  No sandboxes have incurred AI costs in this window yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
