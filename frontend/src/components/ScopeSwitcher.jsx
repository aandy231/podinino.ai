import React, { useState, useRef, useEffect } from 'react';
import { Building, Users, ChevronDown, Check, Plus, ShieldCheck, Shield } from 'lucide-react';

export default function ScopeSwitcher({
  userContext,
  currentOrg,
  currentTeam,
  currentUser,
  onSelectOrg,
  onSelectTeam,
  onCreateTeam
}) {
  const [isOrgOpen, setIsOrgOpen] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [showNewTeamModal, setShowNewTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamBudget, setNewTeamBudget] = useState('250');

  const orgRef = useRef(null);
  const teamRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (orgRef.current && !orgRef.current.contains(e.target)) {
        setIsOrgOpen(false);
      }
      if (teamRef.current && !teamRef.current.contains(e.target)) {
        setIsTeamOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const organizations = userContext?.organizations || [];
  const teams = (userContext?.teams || []).filter(t => !currentOrg || t.org_id === currentOrg.id);

  const isOrgAdmin = currentOrg?.user_role === 'org_owner' || currentOrg?.user_role === 'org_admin';
  const userTeamRole = currentTeam?.user_role || 'team_member';

  const getOrgDisplayName = (org) => {
    if (!org) return 'Organization';
    if (org.is_personal || org.slug?.startsWith('personal-') || (org.name && org.name.includes('(git-'))) {
      const uName = currentUser?.name || currentUser?.login;
      return uName ? `Personal (${uName})` : org.name;
    }
    return org.name;
  };

  const handleCreateTeamSubmit = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    if (onCreateTeam) {
      await onCreateTeam({
        org_id: currentOrg.id,
        name: newTeamName.trim(),
        monthly_budget_usd: parseFloat(newTeamBudget) || 250
      });
    }
    setNewTeamName('');
    setShowNewTeamModal(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* 1. Organization Dropdown */}
      <div ref={orgRef} style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setIsOrgOpen(!isOrgOpen);
            setIsTeamOpen(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '7px',
            fontSize: '12.5px',
            fontWeight: '600',
            color: '#0f172a',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
        >
          <Building size={14} color="#64748b" />
          <span style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getOrgDisplayName(currentOrg)}
          </span>
          <ChevronDown size={12} color="#94a3b8" />
        </button>

        {isOrgOpen && (
          <div style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            width: '210px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '9px',
            boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
            padding: '6px',
            zIndex: 100
          }}>
            <div style={{ padding: '4px 8px', fontSize: '10.5px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
              Organizations
            </div>
            {organizations.map((org) => {
              const isSelected = currentOrg?.id === org.id;
              return (
                <button
                  key={org.id}
                  onClick={() => {
                    onSelectOrg(org);
                    setIsOrgOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                    color: isSelected ? '#0f172a' : '#475569',
                    fontSize: '12.5px',
                    fontWeight: isSelected ? '600' : '400',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getOrgDisplayName(org)}
                  </span>
                  {isSelected && <Check size={14} color="#7c3aed" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span style={{ color: '#cbd5e1', fontSize: '13px' }}>/</span>

      {/* 2. Team Dropdown */}
      <div ref={teamRef} style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setIsTeamOpen(!isTeamOpen);
            setIsOrgOpen(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '7px',
            fontSize: '12.5px',
            fontWeight: '600',
            color: '#0f172a',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
        >
          <Users size={14} color="#64748b" />
          <span style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentTeam?.name || 'Default Team'}
          </span>
          <ChevronDown size={12} color="#94a3b8" />
        </button>

        {isTeamOpen && (
          <div style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            width: '230px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '9px',
            boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
            padding: '6px',
            zIndex: 100
          }}>
            <div style={{ padding: '4px 8px', fontSize: '10.5px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
              Teams in {currentOrg?.name || 'Org'}
            </div>
            {teams.map((team) => {
              const isSelected = currentTeam?.id === team.id;
              const isLead = team.user_role === 'team_lead';
              return (
                <button
                  key={team.id}
                  onClick={() => {
                    onSelectTeam(team);
                    setIsTeamOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                    color: isSelected ? '#0f172a' : '#475569',
                    fontSize: '12.5px',
                    fontWeight: isSelected ? '600' : '400',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team.name}
                    </span>
                    {isLead && (
                      <span style={{
                        fontSize: '9.5px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(124, 58, 237, 0.1)',
                        color: '#7c3aed',
                        fontWeight: '600'
                      }}>
                        Lead
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={14} color="#7c3aed" />}
                </button>
              );
            })}

            {/* Create team action for Org Admins */}
            {isOrgAdmin && (
              <>
                <hr style={{ border: 'none', borderBottom: '1px solid #f1f5f9', margin: '4px 0' }} />
                <button
                  onClick={() => {
                    setIsTeamOpen(false);
                    setShowNewTeamModal(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#7c3aed',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#faf5ff'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Plus size={13} />
                  <span>Create New Team</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. Role Badge */}
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: '5px',
        fontSize: '11px',
        fontWeight: '600',
        backgroundColor: userTeamRole === 'team_lead' ? 'rgba(124,58,237,0.1)' : 'rgba(100,116,139,0.1)',
        color: userTeamRole === 'team_lead' ? '#7c3aed' : '#64748b'
      }}>
        {userTeamRole === 'team_lead' ? 'Team Lead' : 'Developer'}
      </span>

      {/* New Team Modal */}
      {showNewTeamModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15,23,42,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <form
            onSubmit={handleCreateTeamSubmit}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '20px 24px',
              width: '360px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
              Create New Engineering Team
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#64748b' }}>
              Create a team under {currentOrg?.name} to allocate budgets and manage developer sandboxes.
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                Team Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Core Search AI"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                Monthly AI Budget (USD)
              </label>
              <input
                type="number"
                min="10"
                step="10"
                value={newTeamBudget}
                onChange={(e) => setNewTeamBudget(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowNewTeamModal(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: 'transparent',
                  color: '#475569',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Create Team
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
