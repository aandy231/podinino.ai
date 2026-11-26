import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  FolderGit2, 
  GitBranch, 
  Check, 
  Search, 
  AlertTriangle, 
  Layers, 
  Info,
  ShieldAlert,
  Sparkles,
  Building2
} from 'lucide-react';
import { REPOSITORIES } from '../mockData';
import { fetchSkills } from '../services/skillsApi';
import { AVAILABLE_HARNESSES, getHarness } from './ModelSelector';

export default function NewWorkspaceModal({ 
  isOpen, 
  onClose, 
  onCreate, 
  currentUser,
  githubProjects = [],
  activeCount = 0,
  quotaLimit = 5,
  preselectedRepo = null,
  adminSettings,
  availableTeams = [],
  selectedTeam = null
}) {
  const dialogRef = useRef(null);

  // Form State
  const [sandboxName, setSandboxName] = useState('');
  const [selectedHarness, setSelectedHarness] = useState('claude-code');
  const [searchQuery, setSearchQuery] = useState('');
  const [chosenTeamId, setChosenTeamId] = useState(selectedTeam?.id || '');
  
  // Multi-repo selection: map of repo_name -> { name, git_url, branch, full_name }
  const [selectedReposMap, setSelectedReposMap] = useState({});

  // Skills Selection State
  const [availableSkills, setAvailableSkills] = useState([]);
  const [selectedSkillsMap, setSelectedSkillsMap] = useState({});
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [skillsLoading, setSkillsLoading] = useState(false);

  const isQuotaReached = activeCount >= quotaLimit;

  // Merge available repos from GitHub integration or fallback mock data
  const availableRepoList = useMemo(() => {
    if (Array.isArray(githubProjects) && githubProjects.length > 0) {
      return githubProjects.map(r => ({
        id: r.name,
        name: r.name,
        full_name: r.full_name || r.name,
        clone_url: r.clone_url || r.html_url || `https://github.com/${r.full_name || r.name}.git`,
        description: r.description || 'GitHub Repository',
        default_branch: r.default_branch || 'main'
      }));
    }
    return REPOSITORIES.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.name,
      clone_url: r.cloneUrl || `https://github.com/organization/${r.name}.git`,
      description: r.description || 'Repository',
      default_branch: 'main'
    }));
  }, [githubProjects]);

  // Filter available repos by search query
  const filteredRepos = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return availableRepoList;
    return availableRepoList.filter(r => 
      r.name.toLowerCase().includes(q) || 
      (r.full_name && r.full_name.toLowerCase().includes(q))
    );
  }, [availableRepoList, searchQuery]);

  // Filter available skills by search query
  const filteredSkills = useMemo(() => {
    const q = skillSearchQuery.toLowerCase().trim();
    if (!q) return availableSkills;
    return availableSkills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q))
    );
  }, [availableSkills, skillSearchQuery]);

  const toggleSkill = (skill) => {
    setSelectedSkillsMap(prev => {
      const next = { ...prev };
      if (next[skill.id]) {
        delete next[skill.id];
      } else {
        next[skill.id] = skill;
      }
      return next;
    });
  };

  // Sync state values when modal opens
  useEffect(() => {
    if (isOpen) {
      setSandboxName('');
      setSelectedHarness('claude-code');
      setSearchQuery('');
      setSkillSearchQuery('');
      setSelectedSkillsMap({});
      setChosenTeamId(selectedTeam?.id || (availableTeams[0]?.id || ''));

      // Fetch accessible skills
      setSkillsLoading(true);
      fetchSkills({ userId: currentUser?.id || 'default-user' })
        .then(data => setAvailableSkills(data || []))
        .catch(() => setAvailableSkills([]))
        .finally(() => setSkillsLoading(false));

      // Preselect default or passed repo if available
      const initialMap = {};
      if (preselectedRepo) {
        const found = availableRepoList.find(r => r.name === preselectedRepo.name || r.id === preselectedRepo.name);
        if (found) {
          initialMap[found.name] = {
            name: found.name,
            git_url: found.clone_url,
            branch: found.default_branch || 'main',
            full_name: found.full_name
          };
        }
      } else if (availableRepoList.length > 0) {
        const first = availableRepoList[0];
        initialMap[first.name] = {
          name: first.name,
          git_url: first.clone_url,
          branch: first.default_branch || 'main',
          full_name: first.full_name
        };
      }
      setSelectedReposMap(initialMap);
    }
  }, [isOpen, preselectedRepo, availableRepoList, currentUser]);

  // Dialog open/close control
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleBackdropClick = (event) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    
    if (event.target === dialog) {
      onClose();
    }
  };

  const toggleRepoSelection = (repo) => {
    setSelectedReposMap(prev => {
      const next = { ...prev };
      if (next[repo.name]) {
        delete next[repo.name];
      } else {
        next[repo.name] = {
          name: repo.name,
          git_url: repo.clone_url,
          branch: repo.default_branch || 'main',
          full_name: repo.full_name
        };
      }
      return next;
    });
  };

  // Form Submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isQuotaReached) return;

    const selectedReposArray = Object.values(selectedReposMap).map(repo => ({
      ...repo,
      branch: repo.default_branch || repo.branch || 'main'
    }));
    if (selectedReposArray.length === 0) return;

    const finalName = sandboxName.trim() || `${selectedReposArray[0].name}-workspace`;
    const slug = finalName.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const finalId = `sbx-${slug.slice(0, 20)}-${Math.random().toString(36).substring(2, 6)}`;
    const chosenTeam = availableTeams.find(t => t.id === chosenTeamId) || selectedTeam;

    const selectedSkillIds = Object.keys(selectedSkillsMap);

    const newWorkspace = {
      id: finalId,
      workspace_id: finalId,
      name: finalName,
      harness: selectedHarness,
      repo: selectedReposArray[0].name,
      repoUrl: selectedReposArray[0].git_url,
      branch: selectedReposArray[0].branch || 'main',
      repos: selectedReposArray,
      skill_ids: selectedSkillIds,
      owner: currentUser,
      owner_id: currentUser?.id,
      team_id: chosenTeam?.id,
      org_id: chosenTeam?.org_id,
      createdTime: new Date().toISOString(),
      lastActiveTime: new Date().toISOString(),
      status: 'Provisioning',
      url: `https://${finalId}.sandbox.ai`,
      storage_size: '10Gi',
      cpu_request: '200m',
      memory_request: '512Mi',
      cpu_limit: '1000m',
      memory_limit: '2Gi'
    };

    // Close modal immediately
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    if (onClose) {
      onClose();
    }
    if (onCreate) {
      onCreate(newWorkspace);
    }
  };

  const selectedCount = Object.keys(selectedReposMap).length;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{
        margin: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        backgroundColor: '#ffffff',
        color: '#0f172a',
        padding: '0',
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.18)',
        overflow: 'hidden',
        outline: 'none'
      }}
    >
      {/* Modal Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc'
      }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#0f172a' }}>
            Create New Sandbox
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Design your multi-service development workspace
          </p>
        </div>

        {/* Quota Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 9px',
            borderRadius: '12px',
            backgroundColor: isQuotaReached ? '#fef2f2' : '#f1f5f9',
            border: `1px solid ${isQuotaReached ? '#fecaca' : '#e2e8f0'}`,
            fontSize: '11.5px',
            fontWeight: '600',
            color: isQuotaReached ? '#ef4444' : '#475569'
          }}>
            <Layers size={13} />
            <span>Quota: {activeCount} / {quotaLimit}</span>
          </div>

          <button 
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#0f172a'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Quota Exhaustion Warning */}
      {isQuotaReached && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '12px 18px',
          backgroundColor: '#fffbeb',
          borderBottom: '1px solid #fde68a',
          color: '#b45309',
          fontSize: '12px',
          lineHeight: '1.4'
        }}>
          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Sandbox Limit Reached:</strong> You currently have {activeCount} of {quotaLimit} active sandboxes. Delete a completed sandbox in the sidebar to free a slot before creating a new one.
          </div>
        </div>
      )}

      {/* Modal Body / Form */}
      <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>
        
        {/* Team Allocation Selector */}
        {availableTeams && availableTeams.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
              Assign to Engineering Team
            </label>
            <select
              value={chosenTeamId}
              onChange={(e) => setChosenTeamId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                color: '#0f172a',
                backgroundColor: '#ffffff',
                fontWeight: '500'
              }}
            >
              {availableTeams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} (Budget: ${t.monthly_budget_usd || 250}/mo)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sandbox Name Field */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
            Sandbox Name <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input 
            type="text" 
            value={sandboxName}
            onChange={(e) => setSandboxName(e.target.value)}
            placeholder="e.g. auth-and-payments-v2"
            disabled={isQuotaReached}
            required
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#0f172a',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
              transition: 'border-color 0.15s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
          />
        </div>

        {/* AI Agent Harness Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={13} color="#7c3aed" /> Select Agent Harness <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
              {AVAILABLE_HARNESSES.length} available
            </span>
          </div>
          <p style={{ margin: '0 0 4px', fontSize: '11.5px', color: '#64748b' }}>
            Choose the coding agent runtime to power this sandbox.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px'
          }}>
            {AVAILABLE_HARNESSES.map(harness => {
              const isSelected = selectedHarness === harness.id;
              return (
                <div
                  key={harness.id}
                  onClick={() => !isQuotaReached && setSelectedHarness(harness.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '10px',
                    border: isSelected ? `2px solid ${harness.badgeColor}` : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#ffffff' : '#f8fafc',
                    boxShadow: isSelected ? `0 4px 14px ${harness.badgeColor}20` : 'none',
                    cursor: isQuotaReached ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isQuotaReached) {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isQuotaReached) {
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }
                  }}
                >
                  {/* Header row: Icon, Name, Radio Circle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        backgroundColor: isSelected ? `${harness.badgeColor}12` : '#ffffff',
                        border: `1px solid ${isSelected ? `${harness.badgeColor}35` : '#e2e8f0'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {harness.logo ? (
                          <img 
                            src={harness.logo} 
                            alt={harness.name} 
                            style={{ width: '18px', height: '18px', objectFit: 'contain' }} 
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                          />
                        ) : (
                          <span style={{ color: harness.badgeColor, fontWeight: 'bold' }}>✦</span>
                        )}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                        {harness.name}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: isSelected ? `5px solid ${harness.badgeColor}` : '2px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      boxSizing: 'border-box',
                      transition: 'all 0.15s ease'
                    }} />
                  </div>

                  {/* Description */}
                  <p style={{
                    margin: 0,
                    fontSize: '11.5px',
                    color: '#64748b',
                    lineHeight: '1.4'
                  }}>
                    {harness.description}
                  </p>

                  {/* Tag */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '600',
                      color: harness.badgeColor,
                      backgroundColor: `${harness.badgeColor}12`,
                      padding: '1px 6px',
                      borderRadius: '4px'
                    }}>
                      {harness.tag}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Repository Selector Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FolderGit2 size={13} color="#7c3aed" /> Select Services / Repositories
            </label>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
              {selectedCount} selected
            </span>
          </div>

          {/* Repo Search Bar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your GitHub repositories..."
              disabled={isQuotaReached}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                fontSize: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                outline: 'none',
                color: '#0f172a'
              }}
            />
          </div>

          {/* Scrollable Repo Picker List */}
          <div style={{
            maxHeight: '160px',
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {filteredRepos.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                No repositories found matching "{searchQuery}"
              </div>
            ) : (
              filteredRepos.map(repo => {
                const isSelected = !!selectedReposMap[repo.name];
                return (
                  <div
                    key={repo.id || repo.name}
                    onClick={() => !isQuotaReached && toggleRepoSelection(repo)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: isQuotaReached ? 'not-allowed' : 'pointer',
                      backgroundColor: isSelected ? '#ede9fe' : 'transparent',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isQuotaReached) e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && !isQuotaReached) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: isSelected ? '1px solid #7c3aed' : '1px solid #cbd5e1',
                        backgroundColor: isSelected ? '#7c3aed' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        flexShrink: 0
                      }}>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: '600', color: isSelected ? '#6d28d9' : '#0f172a' }}>
                          {repo.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {repo.full_name || repo.description}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      color: '#64748b',
                      backgroundColor: isSelected ? '#ffffff' : '#f1f5f9',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0'
                    }}>
                      {repo.default_branch || 'main'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Assign Skills Section */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Assign Skills</span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '400' }}>(Optional)</span>
            </label>
            <span style={{ fontSize: '12px', color: '#7c3aed', fontWeight: '500' }}>
              {Object.keys(selectedSkillsMap).length} selected
            </span>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#64748b' }}>
            Give your coding agent reusable capabilities for this sandbox.
          </p>

          {/* Selected Skills Chips */}
          {Object.keys(selectedSkillsMap).length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginBottom: '10px',
              padding: '8px 10px',
              backgroundColor: '#faf5ff',
              borderRadius: '8px',
              border: '1px solid #f3e8ff'
            }}>
              {Object.values(selectedSkillsMap).map(skill => (
                <span
                  key={skill.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11.5px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d8b4fe',
                    color: '#6b21a8',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: '500'
                  }}
                >
                  <span>{skill.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: '#9333ea',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Skill Search Field */}
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              placeholder="Search accessible skills..."
              value={skillSearchQuery}
              onChange={e => setSkillSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 30px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Compact Selectable Skill Cards Container */}
          <div style={{
            maxHeight: '140px',
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            padding: '4px'
          }}>
            {skillsLoading ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                Loading skills...
              </div>
            ) : filteredSkills.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                {skillSearchQuery ? 'No matching skills found.' : 'No skills available yet. Create one in the Skills Library!'}
              </div>
            ) : (
              filteredSkills.map(skill => {
                const isSelected = !!selectedSkillsMap[skill.id];
                const isOrg = skill.scope === 'organization';
                return (
                  <div
                    key={skill.id}
                    onClick={() => toggleSkill(skill)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      marginBottom: '3px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#faf5ff' : '#ffffff',
                      border: isSelected ? '1px solid #c084fc' : '1px solid transparent',
                      transition: 'all 0.1s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: isSelected ? '1.5px solid #7c3aed' : '1.5px solid #cbd5e1',
                        backgroundColor: isSelected ? '#7c3aed' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        flexShrink: 0
                      }}>
                        {isSelected && <Check size={11} strokeWidth={3} />}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#0f172a' }}>
                            {skill.name}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '600',
                            padding: '1px 5px',
                            borderRadius: '8px',
                            backgroundColor: isOrg ? '#f3e8ff' : '#f1f5f9',
                            color: isOrg ? '#7c3aed' : '#64748b'
                          }}>
                            {isOrg ? 'Org' : 'Personal'}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '340px'
                        }}>
                          {skill.description}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '10.5px',
                      color: '#94a3b8',
                      backgroundColor: '#f8fafc',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #f1f5f9',
                      flexShrink: 0
                    }}>
                      {skill.category || 'General'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '10px',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '14px',
          marginTop: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Cancel
          </button>
          
          <button
            type="submit"
            disabled={isQuotaReached || selectedCount === 0}
            style={{
              backgroundColor: (isQuotaReached || selectedCount === 0) 
                ? '#cbd5e1' 
                : '#0f172a',
              border: 'none',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '7px 18px',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: (isQuotaReached || selectedCount === 0) ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!isQuotaReached && selectedCount > 0) e.currentTarget.style.backgroundColor = '#1e293b';
            }}
            onMouseLeave={(e) => {
              if (!isQuotaReached && selectedCount > 0) e.currentTarget.style.backgroundColor = '#0f172a';
            }}
          >
            Launch Sandbox ({getHarness(selectedHarness).shortName || getHarness(selectedHarness).name} · {selectedCount} {selectedCount === 1 ? 'Repo' : 'Repos'}{Object.keys(selectedSkillsMap).length > 0 ? ` · ${Object.keys(selectedSkillsMap).length} ${Object.keys(selectedSkillsMap).length === 1 ? 'Skill' : 'Skills'}` : ''})
          </button>
        </div>
      </form>

      {/* Backdrop custom CSS injection */}
      <style>{`
        dialog::backdrop {
          background-color: rgba(15, 23, 42, 0.45) !important;
          backdrop-filter: blur(4px) !important;
          -webkit-backdrop-filter: blur(4px) !important;
        }
      `}</style>
    </dialog>
  );
}
